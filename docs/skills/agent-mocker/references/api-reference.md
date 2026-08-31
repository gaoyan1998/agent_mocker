# Agent Mocker API 完整参考

所有时间字段如无特别说明均为 Unix epoch 毫秒。字段类型的权威来源是
`packages/shared/src/*.ts`（Zod schema）与服务端路由 `apps/server/src/api/*.ts`；
运行中的服务也可直接访问 `GET /docs/json` 获取 OpenAPI 规范。

约定：

- `$BASE` = 服务根地址，默认 `http://localhost:3000`
- `$PID` = 项目 ID，`$KEY` = 项目 API Key，`$SID` = 会话 ID（URL 绑定用 externalId 或会话 id）
- 管理 API `/api/*` 无鉴权；Mock API `/v1/*` 需要 `Authorization: Bearer $KEY`
  （也接受 `api-key` / `x-api-key` 头）
- **无参数的 POST 也要发 `-d '{}'`**：`content-type: application/json` 且请求体为空时
  Fastify 返回 400（影响 `reset-scenarios`、`/timeout`、`/reset-cursor`、`/preview` 等）
- 错误响应：管理 API 为 `{"error":{"message","code","details?"}}`；
  Mock API 为 OpenAI 风格 `{"error":{"message","type","code","param"}}`

---

## 系统

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 存活检查，`{"ok":true,"uptimeMs":...}` |
| GET | `/api/system/info` | 版本、地址、项目/会话/交互计数、`strictApiKey` 等 |

`GET /api/system/info` 响应示例：

```json
{
  "name": "AI Agent Mock Server",
  "version": "0.1.0",
  "mockBaseUrl": "http://localhost:3000/v1",
  "projectCount": 1,
  "sessionCount": 3,
  "interactionCount": 12,
  "pendingRequests": 0,
  "strictApiKey": true
}
```

## 项目

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects` | 项目列表 `{items:[Project]}`（含 sessionCount / interactionCount / waitingCount 统计） |
| POST | `/api/projects` | 创建项目，201 返回 Project（含生成的 `apiKey`） |
| GET | `/api/projects/:id` | 项目详情 |
| PUT | `/api/projects/:id` | 部分更新（name / description / apiKey / settings） |
| POST | `​/api/projects/:id/rotate-key` | 轮换 API Key，旧 Key 立即失效 |
| GET | `/api/projects/:id/waiting` | 当前等待人工处理的 Interaction 列表 `{items}` |
| DELETE | `/api/projects/:id` | 级联删除项目（会话/规则/场景/工具/日志全删） |

`POST /api/projects` 请求体（所有字段均可只传需要的部分）：

```json
{
  "name": "订单 Agent 测试",
  "description": "回归测试用",
  "apiKey": "sk-mock-my-key-01",
  "settings": { "defaultBehavior": "echo" }
}
```

Project 响应关键字段：`id`、`name`、`apiKey`、`settings`、`createdAt`。

### Project Settings 字段

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `defaultBehavior` | `manual` | 兜底行为：`manual`（挂起等人工）/ `echo` / `fixed` / `error` |
| `fixedReply` | - | `fixed` 兜底时的固定回复文本 |
| `manualTimeoutMs` | `300000` | 人工等待超时（1000–3600000），超时返回 408 |
| `responseDelayMs` | `0` | 所有 mock 响应统一追加延迟（0–600000） |
| `streamChunkIntervalMs` | `30` | 流式 chunk 发送间隔 |
| `streamChunkSize` | `2` | 每个流式 chunk 的字符数 |
| `thinkMode` | `reasoning_content` | think 输出方式：`reasoning_content` / `content_tag`（`<think>` 标签）/ `both` |
| `autoSessionIdleMs` | `1800000` | 自动会话空闲复用窗口；URL 未绑会话时复用最近活跃会话 |
| `defaultModel` | `mock-gpt` | 请求未指定 model 时使用 |
| `upstreamEnabled` `upstreamBaseUrl` `upstreamApiKey` `upstreamModel` `upstreams` | - | 转发真实 LLM 的旧版单上游与多上游配置（`upstreams` 数组元素含 `id/name/enabled/baseUrl/apiKey/model`） |

## 会话

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects/:id/sessions?limit&offset&status` | 分页列表，`status` 可选 `active/completed/archived` |
| POST | `/api/projects/:id/sessions` | 创建会话（201） |
| GET | `/api/sessions/:id` | 会话详情（含 interactionCount 等统计） |
| PUT | `/api/sessions/:id` | 部分更新（name/description/status/tags/metadata/ruleIds/scenarioIds） |
| DELETE | `/api/sessions/:id` | 删除会话及其交互 |
| GET | `/api/sessions/:id/interactions?limit&offset&events=false` | 交互列表；`events=false` 省略事件明细 |
| POST | `/api/sessions/:id/replay` | 创建回放会话（201），按序复用源会话响应 |
| POST | `/api/sessions/:id/reset` | 清空会话交互、恢复可调试状态 |
| POST | `/api/sessions/:id/reset-scenarios` | 重置该会话全部场景游标 |
| GET | `/api/sessions/:id/scenario-runs` | 各场景当前游标 `{items:[{scenarioId,cursor,...}]}` |

`POST /api/projects/:id/sessions` 请求体：

```json
{
  "name": "订单测试 run-1",
  "description": "可选",
  "externalId": "order-test-1",
  "tags": ["regression"],
  "metadata": {},
  "ruleIds": ["rule_xxx"],
  "scenarioIds": ["scn_xxx"]
}
```

`externalId` 即 URL 会话前缀（`/{externalId}/v1/...`）；不传时由服务端生成。
Session 响应关键字段：`id`、`projectId`、`externalId`、`status`、`ruleIds`、`scenarioIds`、
`interactionCount`、`auto`、`replaySourceId`。

## 规则（Rule）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects/:id/rules` | 列表 `{items}`（含 `matchCount` 累计命中次数） |
| POST | `/api/projects/:id/rules` | 创建（201） |
| PUT | `/api/rules/:id` | 部分更新 |
| DELETE | `/api/rules/:id` | 删除 |

`POST /api/projects/:id/rules` 请求体：

```json
{
  "name": "规则名",
  "description": "可选",
  "enabled": true,
  "priority": 10,
  "condition": { "type": "always" },
  "action": { "type": "assistant", "content": "你好" }
}
```

`priority` 范围 -999–999，**数值越小越先匹配**，Rule 优先于 Scenario。

### 条件与动作模型

Rule 与 Scenario Step 共用同一套 Condition / Action（类型定义：`packages/shared/src/mock.ts`）。

**Condition**（`target` 默认 `last_user_message`，可选 `last_message` / `all_messages` /
`system_prompt` / `raw_request`；比较 `op` 可选 `eq/ne/gt/gte/lt/lte/contains/regex/exists`）：

```jsonc
{ "type": "always" }
{ "type": "contains", "value": "查订单", "target": "last_user_message", "ignoreCase": true }
{ "type": "equals",   "value": "gpt-4o" }
{ "type": "regex",    "value": "^查\\d+", "target": "last_message", "flags": "i" }
{ "type": "model",    "value": "gpt-4o" }              // 匹配请求 model
{ "type": "tool",     "value": "get_order" }           // 请求声明或历史上出现过的 tool 名
{ "type": "message_count",  "op": "gte", "value": 3 } // messages 长度
{ "type": "sequence_index", "op": "eq",  "value": 2 } // 本会话第几次交互（从 1 开始）
{ "type": "jsonpath", "path": "messages[*].role", "op": "eq", "value": "tool" }  // 任意 JSONPath
{ "type": "all", "conditions": [ /* ... */ ] }         // 递归组合
{ "type": "any", "conditions": [ /* ... */ ] }
{ "type": "not", "condition": { /* ... */ } }
```

`jsonpath` 的 `path` 是对整个 chat completion 请求体求值（如 `messages[-1].content`）。

**Action**（Rule / Scenario Step / 人工 `/action` 通用）：

```jsonc
{ "type": "assistant", "content": "最终回复", "finishReason": "stop" }
{ "type": "think", "content": "推理内容" }
{ "type": "tool_call", "toolCalls": [{ "name": "get_order", "arguments": { "order_id": "1" } }], "content": "可选伴随文本" }
{ "type": "tool_result", "tool": "get_order", "result": {}, "toolCallId": "call_xxx" }  // 不传 result 时用 Tool 配置生成
{ "type": "delay", "ms": 800 }
{ "type": "error", "status": 429, "message": "Rate limit exceeded", "errorType": "rate_limit_error", "code": "rate_limit" }
{ "type": "timeout" }
{ "type": "manual" }                      // 转人工等待
{ "type": "sequence", "actions": [ /* 递归组合 */ ] }
```

`finishReason` 可选 `stop / length / tool_calls / content_filter`。
终结一次交互的事件是 `assistant`、`tool_call`、`error`；`think`、`delay`、`tool_result` 是过程事件。

## 场景（Scenario）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects/:id/scenarios` | 列表 `{items}`（含 steps） |
| POST | `/api/projects/:id/scenarios` | 创建（201） |
| GET | `/api/scenarios/:id` | 详情 |
| PUT | `/api/scenarios/:id` | 部分更新；传 `steps` 时整体替换步骤 |
| POST | `/api/scenarios/:id/reset` | 清除该场景在所有会话中的游标 |
| DELETE | `/api/scenarios/:id` | 删除 |

```json
{
  "name": "订单退款全流程",
  "enabled": true,
  "loop": false,
  "trigger": { "type": "contains", "value": "退款", "target": "last_user_message" },
  "steps": [
    { "name": "查订单", "condition": null,
      "action": { "type": "sequence", "actions": [
        { "type": "think", "content": "先确认订单状态。" },
        { "type": "tool_call", "toolCalls": [{ "name": "get_order", "arguments": { "order_id": "123456" } }] } ] } },
    { "name": "发起退款", "condition": null,
      "action": { "type": "tool_call", "toolCalls": [{ "name": "refund_order", "arguments": { "order_id": "123456" } }] } },
    { "name": "结论", "condition": null,
      "action": { "type": "assistant", "content": "退款已发起，预计 1-3 个工作日到账。" } }
  ]
}
```

推进规则：每个会话对每个场景维护独立游标，**一次请求只执行一步**；游标为 0 时校验 `trigger`，
进入后按 `step.condition`（null = 恒过）顺序推进；走完后 `loop=true` 回到第一步，否则场景不再命中。
步骤里的 `id` 传已有步骤 ID 可在 PUT 更新时保留步骤身份。

## 工具（Tool）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects/:id/tools` | 列表 `{items}`（含 `cursor`） |
| POST | `/api/projects/:id/tools` | 创建（201），同项目名称唯一 |
| POST | `/api/projects/:id/tools/sync` | 按 `name` 幂等同步一批定义 `{tools:[{name,description,parameters}]}` |
| PUT | `/api/tools/:id` | 部分更新 |
| DELETE | `/api/tools/:id` | 删除 |
| POST | `/api/tools/:id/preview` | 用请求体作为调用参数试跑一次（random/sequence 会推进游标） |
| POST | `/api/tools/:id/reset-cursor` | sequence 游标归零 |

`POST /api/projects/:id/tools` 请求体：

```json
{
  "name": "get_order",
  "description": "查询订单详情",
  "parameters": { "type": "object", "properties": { "order_id": { "type": "string" } }, "required": ["order_id"] },
  "responseMode": "template",
  "response": { "order_id": "{{order_id}}", "status": "paid" },
  "responses": [],
  "errorMessage": "查询失败",
  "delayMs": 0
}
```

- `name` 仅允许 `[a-zA-Z0-9_.-]+`，最长 80。
- `responseMode`：
  - `static` — 原样返回 `response`
  - `template` — 对 `response` 做 `{{路径}}` 渲染（路径相对调用参数；`{{$now}}` ISO 时间、`{{$id}}` 随机短 ID），
    结果尝试 JSON 解析，失败则回退为字符串
  - `random` — 从 `responses`（空则 `[response]`）随机取一个
  - `sequence` — 按 `responses` 顺序循环推进（游标持久化在 Tool 上）
  - `error` — 返回 `{"error": errorMessage}`，`/v1/tools/:name` 下 HTTP 500

## 人工控制（处理 waiting 状态的交互）

所有动作 POST 后返回 `{ok, terminal, events, interaction}`。只对挂起/等待中的交互有效。

| 方法 | 路径 | 请求体 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/interactions/:id` | - | 交互详情（request/response/events） |
| POST | `/api/interactions/:id/reply` | `{"content":"...", "finishReason?":"stop", "delayMs?":0}` | 人工回复（终结） |
| POST | `/api/interactions/:id/think` | `{"content":"..."}` | 追加推理，不终结，可连发多条 |
| POST | `/api/interactions/:id/tool-call` | `{"toolCalls":[{"name","arguments"}]}` 或简写 `{"name","arguments"}` | 人工发起 tool call（终结） |
| POST | `/api/interactions/:id/tool-result` | `{"tool":"get_order","result":{}}` 或 `{"tool":"get_order","useToolConfig":true}` | 记录 tool 结果（过程事件） |
| POST | `/api/interactions/:id/error` | `{"status":429,"message":"...","errorType?":"rate_limit_error","code?":null}` | 以错误终结 |
| POST | `/api/interactions/:id/timeout` | 无 | 以超时终结 |
| POST | `/api/interactions/:id/upstream` | `{"upstreamId?":"...","model?":"..."}` | 转发到项目配置的真实上游并把结果应用到本次交互 |
| POST | `/api/interactions/:id/action` | `{"action": <MockAction>}` | 通用入口，可投递 sequence 等任意动作 |

查找待处理交互：`GET /api/projects/:id/waiting`，或 SSE 订阅 `interaction.created` /
`interaction.updated` 事件。流式挂起请求的 think 会以 `reasoning_content` 增量到达 Agent。

## 日志

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects/:id/logs?limit&offset&sessionId&status&path&from&to` | 分页请求日志（原始 HTTP 请求/响应体） |
| DELETE | `/api/projects/:id/logs` | 清空项目日志 |

## 事件流（SSE）

| 方法 | 路径 | 过滤范围 |
| --- | --- | --- |
| GET | `/api/projects/:id/events` | 项目全部事件 |
| GET | `/api/sessions/:id/events` | 单会话事件 |

帧格式 `event: <type>\ndata: <StreamEvent JSON>\n\n`，25s 心跳注释行。
`type`：`ready`、`session.created`、`session.updated`、`session.deleted`、
`interaction.created`、`interaction.updated`、`interaction.event`、`interaction.completed`、`ping`。

## Mock API（OpenAI 兼容，给 Agent 用）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/chat/completions` | 聊天补全（会话自动复用） |
| POST | `/{sessionId}/v1/chat/completions` | 绑定指定会话（不存在则自动创建） |
| GET | `/v1/models`、`/{sessionId}/v1/models` | 模型列表（defaultModel、mock-gpt、gpt-4o、gpt-4o-mini） |
| GET | `/v1/tools`、`/{sessionId}/v1/tools` | 项目 Tool 定义列表 |
| POST | `/v1/tools/:name`、`/{sessionId}/v1/tools/:name` | **直接调用 Mock Tool**：按 Tool 配置生成响应，Tool 未配置返回 404，error 模式返回 500 |

chat/completions 请求体即 OpenAI Chat Completions（`messages` 必填；`model` 缺省用项目
`defaultModel`；支持 `stream`、`stream_options.include_usage`、`tools`、`temperature` 等；
未列出的扩展字段原样保留）。响应为标准 `chat.completion`，`usage` 为估算值。

会话绑定优先级：URL `/{sessionId}/v1` → 复用最近活跃自动会话（`autoSessionIdleMs` 窗口内）→
新建自动会话。辅助请求头：`X-Mock-Session-Name`（会话命名提示，非 ASCII 用
`encodeURIComponent`）、`X-Mock-Project-ID`（Key 之外兜底定位项目）。
流式响应 SSE 帧与 OpenAI 一致，结尾 `data: [DONE]`；流中途出错时 HTTP 仍 200，
错误对象作为 `data:` 帧发出。
