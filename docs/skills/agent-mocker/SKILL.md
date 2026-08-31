---
name: agent-mocker
description: >
  操作 Agent Mocker并通过接口构建测试项目的完整指南：
  用管理 API（/api/*）创建项目、配置 Rule / Scenario / Tool、绑定 Session，用 OpenAI 兼容
  接口（/v1/chat/completions）驱动 Agent 请求，模拟 tool_call / 429 / 超时 / 人工介入，
  并用 Session Replay 回归。Use whenever the task involves agent-mocker、本项目的 mock
  server、mock 联调、搭建 Agent 测试项目、mock tool_call、模拟 429/超时、人工介入、
  session replay，或用户让 agent「通过接口操作 mock 系统」「构建测试项目」
---

# Agent Mocker 测试项目构建指南

Agent Mocker 是一个**不调用真实 LLM** 的 OpenAI 兼容 Mock Server。把 Agent 的 `base_url`
指过来，所有"模型响应"由 Rule / Scenario / Tool 配置和人工操作决定：零 Token、可复现、全程留痕。

## 1. 系统架构：两个 API 平面

| 平面 | 前缀 | 用途 | 鉴权 |
| --- | --- | --- | --- |
| Mock API（给 Agent） | `/v1/*` 或 `/{sessionId}/v1/*` | OpenAI 兼容：chat/completions、models、tools | `Authorization: Bearer <项目 API Key>` |
| 管理 API（给测试脚本） | `/api/*` | 项目/会话/规则/场景/工具 CRUD、人工控制、日志、SSE | 无鉴权（本地管理接口） |

默认地址 `$BASE=http://localhost:3000`,Swagger UI 在 `/docs`，
OpenAPI JSON 在 `/docs/json`——写代码前可以先拉一份规范核对字段。

两个平面各司其职：**测试脚本用管理 API 搭建测试夹具，用 Mock API 扮演"模型"驱动被测 Agent。**

## 2. 响应由谁决定：决策链

每次 `/v1/chat/completions` 请求按以下顺序决策（`apps/server/src/engine/mock-engine.ts`）：

```text
Replay（会话是回放会话）→ Rule → Scenario → 项目兜底 defaultBehavior
```

- **Rule**：只匹配**会话显式绑定**（`ruleIds`）且启用的规则，按 `priority` 从小到大，命中即执行其 Action。
- **Scenario**：只推进**会话显式绑定**（`scenarioIds`）且启用的场景。每个会话对每个场景维护独立游标，
  **一次请求只执行一步**（正好对应"返回 tool_call → Agent 再请求 → 最终回复"的多轮节奏）；
  游标在 0 时才校验 `trigger`，进入后按步骤顺序走，`loop: true` 时走完回到第一步。
- **defaultBehavior**（默认 `manual`）：`manual`（挂起等人工）、`echo`、`fixed`、`error`。

### ⚠️ 三个最容易踩的坑

1. **规则/场景不会自动生效。** 新建的 Rule / Scenario 必须写进会话的 `ruleIds` / `scenarioIds`
   （创建会话时传入，或 `PUT /api/sessions/:id` 更新），否则永远不匹配，请求落到 defaultBehavior。
   自动创建的会话不绑定任何规则。
2. **请求"卡住不返回"= defaultBehavior 是 `manual`（默认值）。** 没命中规则时请求会挂起（pending），
   等人工通过管理 API 处理，超过 `manualTimeoutMs`（默认 300 秒）返回 408。
   想要"纯脚本无人工"跑通，要么绑定规则/场景，要么把项目 `defaultBehavior` 设为 `echo`/`fixed`。
3. 绑定会话的唯一方式是 URL 前缀 `/{sessionId}/v1/...`；`X-Mock-Session-Name`（会话命名提示，
   非 ASCII 需 percent-encode）和 `X-Mock-Project-ID`（Key 兜底定位项目）是真实存在的辅助头。
4. **无参数的 POST 也要带请求体 `{}`**。服务端对 `content-type: application/json` 且请求体为空的
   POST 一律返回 400，`reset-scenarios`、`/timeout`、`/reset-cursor` 等"无参数"端点也不例外。

## 3. 标准工作流：从零构建一个测试项目

假设服务已在 3000 端口运行。

### 第 0 步：连通性检查

```bash
curl -s $BASE/api/health           # {"ok":true,...}
curl -s $BASE/api/projects         # 已有项目列表；首次启动有内置示例项目（apiKey=sk-mock-demo）
```

快速复用内置示例项目（含 `get_order`/`refund_order` 两个 Tool 和 3 条规则）可以直接跳到第 4 步；
要构建自己的测试夹具则继续。

### 第 1 步：创建项目（得到 API Key）

```bash
curl -s -X POST $BASE/api/projects -H 'content-type: application/json' -d '{
  "name": "订单 Agent 测试",
  "settings": { "defaultBehavior": "echo" }
}'
```

响应里的 `apiKey`（形如 `sk-mock-xxxx`）和 `id` 记下来。设置字段都可以只传一部分，
完整清单见 [references/api-reference.md](references/api-reference.md)。
如果 Agent 侧不方便配 Key，也可以建项目时用 `MOCK_STRICT_API_KEY=false` + 单项目的兜底，
或每次请求带 `X-Mock-Project-ID: <项目id>`。

### 第 2 步：注册 Mock Tool（模拟外部系统）

Tool 定义和函数签名与 OpenAI function calling 一致，多出 mock 响应配置：

```bash
curl -s -X POST $BASE/api/projects/$PID/tools -H 'content-type: application/json' -d '{
  "name": "get_order",
  "description": "查询订单详情",
  "parameters": {
    "type": "object",
    "properties": { "order_id": { "type": "string" } },
    "required": ["order_id"]
  },
  "responseMode": "template",
  "response": { "order_id": "{{order_id}}", "status": "paid", "amount": 199 },
  "delayMs": 200
}'
```

`responseMode` 五种：`static`（原样返回 `response`）、`template`（`{{参数路径}}` 填充调用参数，
内置 `{{$now}}`/`{{$id}}`）、`random`（从 `responses` 随机）、`sequence`（按 `responses` 顺序推进游标，
适合"第一次成功第二次失败"）、`error`（返回 `errorMessage`）。
如果 Agent 的 tool 定义已经在手边，可用幂等的 `POST /api/projects/$PID/tools/sync` 批量同步。

### 第 3 步：编写 Rule（条件 → 动作）

Rule = `WHEN condition THEN action`。Condition 和 Action 的完整类型见
[references/api-reference.md](references/api-reference.md#条件与动作模型)。

```bash
curl -s -X POST $BASE/api/projects/$PID/rules -H 'content-type: application/json' -d '{
  "name": "查订单 → 发起 tool_call",
  "priority": 10,
  "condition": { "type": "contains", "value": "查询订单", "target": "last_user_message" },
  "action": {
    "type": "sequence",
    "actions": [
      { "type": "think", "content": "用户想查订单，先调用 get_order。" },
      { "type": "tool_call", "toolCalls": [{ "name": "get_order", "arguments": { "order_id": "123456" } }] }
    ]
  }
}'
```

### 第 4 步：创建会话并绑定规则（关键！）

```bash
curl -s -X POST $BASE/api/projects/$PID/sessions -H 'content-type: application/json' -d '{
  "name": "订单测试 run-1",
  "externalId": "order-test-1",
  "ruleIds": ["<第3步返回的规则id>", "..."],
  "scenarioIds": []
}'
```

`externalId` 之后就是 URL 里的会话前缀。**不绑 `ruleIds` 规则就不生效**（见第 2 节的坑 1）。

### 第 5 步：用 OpenAI 兼容接口驱动 Agent 逻辑

```bash
curl -s -X POST "$BASE/order-test-1/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" -H 'content-type: application/json' \
  -d '{ "model": "gpt-4o", "messages": [{ "role": "user", "content": "帮我查询订单" }] }'
```

返回标准 `chat.completion`；命中上面的规则时 `choices[0].message.tool_calls` 里有 `get_order`。
不需要绑定会话时直接打 `$BASE/v1/chat/completions`（复用最近活跃的自动会话，30 分钟空闲窗口内）。

### 第 6 步：执行 Tool 并回传结果（多轮循环）

Mock Server 不主动推送 Tool Result，由 Agent（或你的测试脚本）执行后放进下一轮请求：

```bash
# 方式 A：不写真实实现，直接用 Mock Tool 端点取假数据（按 Tool 配置生成响应）
curl -s -X POST "$BASE/order-test-1/v1/tools/get_order" \
  -H "Authorization: Bearer $API_KEY" -H 'content-type: application/json' \
  -d '{ "order_id": "123456" }'
# → {"order_id":"123456","status":"paid","amount":199}

# 方式 B：测试脚本自己编造结果也可以——Tool 配置只影响方式 A 和 tool_result 动作的默认值。
```

把上一轮的 assistant 消息和 tool 结果追加进 messages 再次请求：

```bash
curl -s -X POST "$BASE/order-test-1/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" -H 'content-type: application/json' -d '{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "帮我查询订单" },
    { "role": "assistant", "content": null, "tool_calls": [{ "id": "<上轮返回的id>", "type": "function",
      "function": { "name": "get_order", "arguments": "{\"order_id\":\"123456\"}" } }] },
    { "role": "tool", "tool_call_id": "<上轮返回的id>", "name": "get_order", "content": "{\"status\":\"paid\"}" }
  ]
}'
```

可以再加一条规则匹配"消息里有 role=tool"来返回最终答复（内置示例项目就是这么做的）：

```json
{ "type": "jsonpath", "path": "messages[*].role", "op": "eq", "value": "tool" }
```

**注意优先级交互**：规则按 `priority` 从小到大依次匹配。"发起 tool_call" 的规则必须用
`not` 条件排除已携带 tool 结果的请求（`{ "type": "not", "condition": { "type": "jsonpath",
"path": "messages[*].role", "op": "eq", "value": "tool" } }` 包进 `all` 组合），
否则第二轮（用户消息和 tool 消息同时在）会再次命中它，陷入无限 tool_call 循环。
完整可运行的写法见 [references/recipes.md](references/recipes.md) 配方 A。

### 第 7 步：验证结果

```bash
curl -s "$BASE/api/sessions/<会话id>/interactions"          # 每次请求的 request/response/events
curl -s "$BASE/api/projects/$PID/rules" | jq '.items[].matchCount'  # 规则命中次数
curl -s "$BASE/api/projects/$PID/logs?limit=20"             # 原始 HTTP 日志
```

一条 Interaction 的 `mode` 字段标明决策来源（`rule`/`scenario`/`manual`/`auto`/`replay`），
`events` 数组按顺序记录 `request → decision → think → tool_call → tool_result → assistant`，
是断言"Agent 走了哪条分支"的依据。

更完整的端到端脚本（Node，无第三方依赖）见 [references/recipes.md](references/recipes.md)；
本仓库的 `examples/smoke.mjs` 是同一套流程的官方示例。

## 4. 常用测试手法速查

### 错误 / 超时 / 延迟注入

```jsonc
// Rule / Scenario step 的 action：
{ "type": "error", "status": 429, "message": "Rate limit exceeded",
  "errorType": "rate_limit_error", "code": "rate_limit" }        // 返回真实 429
{ "type": "timeout" }                                            // 模拟超时（408 语义）
{ "type": "sequence", "actions": [
    { "type": "delay", "ms": 800 },
    { "type": "error", "status": 500, "message": "boom" } ] }     // 先延迟再报错，测退避重试
```

Tool 级错误：`responseMode: "error"` + `errorMessage`；或 `sequence` 模式让第 N 次调用失败。
项目级延迟：`settings.responseDelayMs` 对所有 mock 响应生效。

### 人工介入（manual 模式）

请求挂起后（Interaction 状态 `waiting`），先查待办再推事件：

```bash
curl -s $BASE/api/projects/$PID/waiting                          # 找到 interaction id
curl -s -X POST $BASE/api/interactions/$IID/reply -H 'content-type: application/json' \
  -d '{ "content": "人工坐席回复：已为您处理。" }'
```

其他动作：`/think`（不终结，流式下持续推 reasoning）、`/tool-call`、`/tool-result`、
`/error`、`/timeout`、`/upstream`（转发到真实 LLM）、`/action`（投递任意 MockAction，含 sequence）。
终结交互的是 `assistant` / `tool_call` / `error`（以及 timeout 动作）。

### Session Replay（回归同一交互轨迹）

```bash
curl -s -X POST $BASE/api/sessions/<源会话id>/replay -H 'content-type: application/json' \
  -d '{ "name": "回归 run" }'
# 响应里的 externalId（replay_xxx）作为 URL 前缀重跑 Agent：
# POST $BASE/replay_xxx/v1/chat/completions —— 按交互序号复用源会话的响应
```

调试场景中途乱了可以重置游标：`POST /api/sessions/:id/reset-scenarios`、
`POST /api/scenarios/:id/reset`、`POST /api/tools/:id/reset-cursor`。

### 流式（SSE）

请求体加 `"stream": true` 即返回 OpenAI 格式 SSE；`think` 内容按项目 `thinkMode`
进入 `delta.reasoning_content`（默认）或 `<think>...</think>` 标签。
错误发生在流中途时 HTTP 仍是 200，错误对象以 `data:` 帧发送。
解析示例见 `examples/smoke.mjs` 的 `streamChat()`。

## 5. 深入阅读

- [references/api-reference.md](references/api-reference.md)：全部端点、请求/响应示例、
  Condition / Action / Settings 完整字段、SSE 事件类型。
- [references/recipes.md](references/recipes.md)：可直接运行的端到端脚本
  （规则驱动的多轮 Tool Call、Scenario 多步流程、429 退避测试、人工介入、Replay）。

