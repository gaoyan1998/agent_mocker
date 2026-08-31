# 端到端测试脚本配方

以下脚本均可直接运行验证（不依赖第三方包，Node 18+ 自带 fetch；服务需已在本地启动）。
把需要的部分拷进你自己的测试工程时，记得替换 `$BASE`、项目 ID、API Key 等占位值。

---

## 配方 A：规则驱动的多轮 Tool Call 全流程（主配方）

完整链路：建项目 → 注册 Tool → 写 Rule → 绑定会话 → 两轮请求 → 校验时间线。
保存为 `recipe-a.mjs` 后 `node recipe-a.mjs` 即可运行（服务端先用
`MOCK_PORT=3999 MOCK_DB_PATH=/tmp/test.db pnpm dev:server` 起一个干净实例可避免污染数据）。

```js
const BASE = process.env.MOCK_BASE_URL ?? 'http://localhost:3999';
const api = async (path, opts = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'content-type': 'application/json', ...opts.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
};

// 1. 连通性
console.log('health:', await api('/api/health'));

// 2. 创建项目（拿到 API Key）
const project = await api('/api/projects', {
  method: 'POST',
  body: JSON.stringify({ name: 'recipe-a', settings: { defaultBehavior: 'echo' } }),
});
const { id: PID, apiKey: KEY } = project;
// agent() 与 api() 同一实现，只是路径打向 Mock API 并带 Bearer Key
const agent = (path, body) => api(path, {
  method: 'POST',
  headers: { authorization: `Bearer ${KEY}` },
  body: JSON.stringify(body),
});

// 3. 注册 Mock Tool
const tool = await api(`/api/projects/${PID}/tools`, {
  method: 'POST',
  body: JSON.stringify({
    name: 'get_weather',
    description: '查询城市天气',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
    responseMode: 'template',
    response: { city: '{{city}}', weather: 'sunny', temp: 26 },
  }),
});

// 4. 两条规则：问天气 → 发起 tool_call；收到 tool 结果 → 给最终答复。
//    注意 priority：数值小的先匹配。第一条必须用 not 排除"已携带 tool 结果"的请求，
//    否则第二轮（既有用户提问又有 tool 消息）会再次命中 tool_call 规则，死循环。
const ruleCall = await api(`/api/projects/${PID}/rules`, {
  method: 'POST',
  body: JSON.stringify({
    name: '问天气 → tool_call',
    priority: 10,
    condition: {
      type: 'all',
      conditions: [
        { type: 'contains', value: '天气', target: 'last_user_message' },
        { type: 'not', condition: { type: 'jsonpath', path: 'messages[*].role', op: 'eq', value: 'tool' } },
      ],
    },
    action: { type: 'tool_call', toolCalls: [{ name: 'get_weather', arguments: { city: '上海' } }] },
  }),
});
const ruleAnswer = await api(`/api/projects/${PID}/rules`, {
  method: 'POST',
  body: JSON.stringify({
    name: '收到天气 → 答复',
    priority: 20,
    condition: { type: 'jsonpath', path: 'messages[*].role', op: 'eq', value: 'tool' },
    action: { type: 'assistant', content: '上海今天是晴天，26 度。' },
  }),
});

// 5. 创建会话并绑定规则（关键步骤：不绑则规则永不生效）
const session = await api(`/api/projects/${PID}/sessions`, {
  method: 'POST',
  body: JSON.stringify({
    name: 'recipe-a run',
    externalId: 'recipe-a-1',
    ruleIds: [ruleCall.id, ruleAnswer.id],
  }),
});

// 6. 第一轮：期望返回 tool_call
const first = await agent('/recipe-a-1/v1/chat/completions', {
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '上海天气怎么样？' }],
});
console.log('round-1:', first.choices[0].message);   // tool_calls 里应有 get_weather

// 7. 执行 Tool：直接用 Mock Tool 端点取假数据（也可以自己编结果）
const call = first.choices[0].message.tool_calls[0];
const toolResult = await agent(`/recipe-a-1/v1/tools/${call.function.name}`,
  JSON.parse(call.function.arguments || '{}'));
console.log('tool result:', toolResult);             // {city:"上海",weather:"sunny",temp:26}

// 8. 第二轮：回传 tool 结果，拿最终答复
const second = await agent('/recipe-a-1/v1/chat/completions', {
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: '上海天气怎么样？' },
    first.choices[0].message,
    { role: 'tool', tool_call_id: call.id, name: call.function.name,
      content: JSON.stringify(toolResult) },
  ],
});
console.log('round-2:', second.choices[0].message);  // content 应为规则里的答复

// 9. 校验：交互时间线 + 规则命中计数
const interactions = await api(`/api/sessions/${session.id}/interactions`);
console.log('interactions:', interactions.items.map((it) => ({
  seq: it.sequence, mode: it.mode, status: it.status,
  events: it.events.map((e) => e.type),
})));
const rules = await api(`/api/projects/${PID}/rules`);
console.log('matchCount:', rules.items.map((r) => [r.name, r.matchCount]));

// 10. 清理（可选）：删除项目连带全部数据
// await api(`/api/projects/${PID}`, { method: 'DELETE' });
```

---

## 配方 B：Scenario 多步流程

Scenario 一次请求推进一步，正好对应 Agent 的多轮往返。以下用三条请求走完"查订单 → 退款 → 结论"。

```bash
BASE=http://localhost:3999

# 1. 建场景（复用示例项目 sk-mock-demo，或按配方 A 换成自己的项目）
SCN=$(curl -s -X POST $BASE/api/projects/$PID/scenarios -H 'content-type: application/json' -d '{
  "name": "退款流程",
  "trigger": { "type": "contains", "value": "退款", "target": "last_user_message" },
  "loop": false,
  "steps": [
    { "name": "查订单", "action": { "type": "tool_call",
        "toolCalls": [{ "name": "get_order", "arguments": { "order_id": "123456" } }] } },
    { "name": "发起退款", "action": { "type": "tool_call",
        "toolCalls": [{ "name": "refund_order", "arguments": { "order_id": "123456" } }] } },
    { "name": "结论", "action": { "type": "assistant", "content": "退款已发起。" } }
  ]
}' | jq -r .id)

# 2. 绑定到会话（scenarioIds！）
curl -s -X POST $BASE/api/projects/$PID/sessions -H 'content-type: application/json' \
  -d "{ \"name\": \"scn run\", \"externalId\": \"scn-1\", \"scenarioIds\": [\"$SCN\"] }"

# 3. 三次请求 = 三步（每轮之间由 Agent 决定下一步输入）
curl -s -X POST "$BASE/scn-1/v1/chat/completions" -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' -d '{"model":"gpt-4o","messages":[{"role":"user","content":"我要退款"}]}'
# → 第 1 步 tool_call: get_order

# （Agent 执行 get_order，把结果回传后再次请求）
curl -s -X POST "$BASE/scn-1/v1/chat/completions" ... # → 第 2 步 tool_call: refund_order
# （Agent 执行 refund_order，回传后再次请求）
curl -s -X POST "$BASE/scn-1/v1/chat/completions" ... # → 第 3 步 assistant: "退款已发起。"

# 4. 调试完重置游标，可反复调试同一场景（无请求体的 POST 也要带 -d '{}'，见下方注意）
curl -s -X POST $BASE/api/sessions/<会话id>/reset-scenarios -H 'content-type: application/json' -d '{}'
```

> **注意**：服务端（Fastify）对 `content-type: application/json` 但请求体为空的 POST 一律返回
> 400（`Body cannot be empty`）。`reset-scenarios`、`/api/interactions/:id/timeout`、
> `/api/scenarios/:id/reset`、`/api/tools/:id/reset-cursor` 这类"无参数"端点也要发 `{}`。

---

## 配方 C：429 / 错误退避测试

用一条"命中即先延迟再 429"的规则验证 Agent 的重试与降级逻辑：

```bash
curl -s -X POST $BASE/api/projects/$PID/rules -H 'content-type: application/json' -d '{
  "name": "限流模拟",
  "priority": 5,
  "condition": { "type": "contains", "value": "__rate_limit__", "target": "raw_request" },
  "action": {
    "type": "sequence",
    "actions": [
      { "type": "delay", "ms": 800 },
      { "type": "error", "status": 429, "message": "Rate limit exceeded",
        "errorType": "rate_limit_error", "code": "rate_limit" }
    ]
  }
}'
```

在 Agent 发出的 prompt 里带上 `__rate_limit__` 标记（或在测试里直接发一条含标记的消息），
即可让该次请求稳定返回 429。`raw_request` target 匹配整个序列化请求体，适合当"开关"用。

纯延迟测试不需要规则：项目设置 `responseDelayMs: 3000` 即可让所有响应慢 3 秒。

---

## 配方 D：人工介入（manual 模式）

项目 `defaultBehavior` 保持默认 `manual` 时，未命中规则的请求会挂起；由人工侧处理：

```bash
# Agent 发出请求 —— 该 HTTP 请求会一直挂着（直到人工终结或 manualTimeoutMs 超时）
curl -N -X POST "$BASE/v1/chat/completions" -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"转人工：这笔订单有问题"}]}' &

# 人工侧：找到等待中的交互
IID=$(curl -s $BASE/api/projects/$PID/waiting | jq -r '.items[0].id')

# 可选：先推一条 think（流式下 Agent 会收到 reasoning_content 增量，不终结请求）
curl -s -X POST $BASE/api/interactions/$IID/think -H 'content-type: application/json' \
  -d '{"content":"用户情绪激动，我需要人工确认退款政策。"}'

# 人工回复（终结）
curl -s -X POST $BASE/api/interactions/$IID/reply -H 'content-type: application/json' \
  -d '{"content":"您好，人工坐席为您处理。"}'
```

脚本化人工决策也可以走通用入口 `/api/interactions/$IID/action`，
投递任意 MockAction（含 `sequence` 组合）。

---

## 配方 E：Session Replay 回归

```bash
# 1. 选一个有完整交互记录的源会话，创建回放会话
REPLAY=$(curl -s -X POST $BASE/api/sessions/<源会话id>/replay \
  -H 'content-type: application/json' -d '{"name":"回归 run"}')
echo $REPLAY | jq '{id, externalId}'   # externalId 形如 replay_xxxxxx

# 2. 用回放会话的 externalId 作为 URL 前缀重跑 Agent（相同输入）。
#    Mock Server 按交互序号复用源会话的响应，Agent 侧的其他行为照常记录。
curl -s -X POST "$BASE/replay_xxxxxx/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"帮我查询订单"}]}'

# 3. 对比两个会话的时间线
curl -s "$BASE/api/sessions/<源会话id>/interactions?events=false" | jq
curl -s "$BASE/api/sessions/<回放会话id>/interactions?events=false" | jq
```

---

## 配方 F：监听 SSE 做实时断言（可选）

```js
// 订阅项目事件流，等 Agent 请求到达后按事件驱动断言
const events = await fetch(`${BASE}/api/projects/${PID}/events`);
const reader = events.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  for (const line of buffer.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const evt = JSON.parse(line.slice(6));
    if (evt.type === 'interaction.created') console.log('新请求:', evt.interaction?.id);
    if (evt.type === 'interaction.completed') console.log('请求完成:', evt.interaction?.id);
  }
  buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
}
```
