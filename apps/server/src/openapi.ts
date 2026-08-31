import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance, FastifySchema } from 'fastify';
import { config } from './config.js';

type Schema = Record<string, unknown>;
type RouteDoc = FastifySchema & { operationId: string };

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const array = (items: Schema, description?: string): Schema => ({
  type: 'array',
  items,
  ...(description ? { description } : {}),
});
const object = (
  properties: Record<string, Schema>,
  required: string[] = [],
  description?: string,
  additionalProperties: boolean | Schema = false,
): Schema => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  ...(description ? { description } : {}),
  additionalProperties,
});
const string = (description: string, extra: Schema = {}): Schema => ({
  type: 'string',
  description,
  ...extra,
});
const integer = (description: string, extra: Schema = {}): Schema => ({
  type: 'integer',
  description,
  ...extra,
});
const number = (description: string, extra: Schema = {}): Schema => ({
  type: 'number',
  description,
  ...extra,
});
const boolean = (description: string): Schema => ({ type: 'boolean', description });
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] });
const idParams = (description: string): Schema =>
  object({ id: string(description, { minLength: 1 }) }, ['id']);
const sessionPathParams = object(
  { sessionId: string('URL 会话标识；用于把多次 Agent 请求绑定到同一个调试会话。') },
  ['sessionId'],
);
const ok = object({ ok: boolean('操作是否成功。') }, ['ok']);
const noContent: Schema = { type: 'null', description: '操作成功，无响应体。' };

const schemas: Record<string, Schema> = {
  ErrorResponse: object(
    {
      error: object(
        {
          message: string('可读的错误说明。'),
          code: string('稳定的错误代码，便于客户端分支处理。'),
          details: { description: '可选的错误详情；参数错误时通常为 Zod issues 数组。' },
        },
        ['message', 'code'],
      ),
    },
    ['error'],
    '管理 API 的统一错误响应。',
  ),
  OpenAiError: object(
    {
      error: object(
        {
          message: string('OpenAI 风格错误信息。'),
          type: string('错误类型，例如 invalid_request_error。'),
          code: nullable(string('机器可读错误代码。')),
          param: nullable(string('导致错误的请求参数；无法定位时为 null。')),
        },
        ['message', 'type', 'code', 'param'],
      ),
    },
    ['error'],
  ),
  UpstreamConfig: object(
    {
      id: string('上游配置唯一标识。'),
      name: string('上游显示名称。'),
      enabled: boolean('是否允许选择该上游。'),
      baseUrl: string('OpenAI 兼容 API 根地址。', { format: 'uri' }),
      apiKey: string('上游 API Key；空字符串表示不发送 Bearer Token。'),
      model: string('默认转发模型；空字符串表示沿用原请求模型。'),
    },
    ['id', 'name', 'enabled', 'baseUrl', 'apiKey', 'model'],
  ),
  ProjectSettings: object(
    {
      defaultBehavior: string('无规则或场景命中时的兜底行为。', {
        enum: ['manual', 'fixed', 'echo', 'random', 'error', 'upstream'],
      }),
      fixedReply: string('defaultBehavior=fixed 时返回的文本。'),
      manualTimeoutMs: integer('人工等待超时毫秒数。', { minimum: 1000, maximum: 3600000 }),
      responseDelayMs: integer('所有 mock 响应附加的延迟毫秒数。', { minimum: 0, maximum: 600000 }),
      streamChunkIntervalMs: integer('流式 chunk 发送间隔毫秒数。', { minimum: 0, maximum: 10000 }),
      streamChunkSize: integer('每个流式文本 chunk 的字符数。', { minimum: 1, maximum: 2000 }),
      thinkMode: string('Think 内容输出方式。', { enum: ['reasoning_content', 'think_tag', 'both'] }),
      autoSessionIdleMs: integer('自动会话空闲复用窗口毫秒数；0 表示不复用。', { minimum: 0 }),
      defaultModel: string('请求未指定 model 时使用的模型名。'),
      upstreamEnabled: boolean('是否启用旧版单上游配置。'),
      upstreamBaseUrl: string('旧版上游 OpenAI 兼容地址；可为空。'),
      upstreamApiKey: string('旧版上游 API Key。'),
      upstreamModel: string('旧版上游默认模型。'),
      upstreams: array(ref('UpstreamConfig'), '可供人工转发选择的多上游配置。'),
    },
    [
      'defaultBehavior', 'fixedReply', 'manualTimeoutMs', 'responseDelayMs',
      'streamChunkIntervalMs', 'streamChunkSize', 'thinkMode', 'autoSessionIdleMs',
      'defaultModel', 'upstreamEnabled', 'upstreamBaseUrl', 'upstreamApiKey',
      'upstreamModel', 'upstreams',
    ],
  ),
  Project: object(
    {
      id: string('项目唯一标识。'),
      name: string('项目名称。'),
      description: string('项目说明。'),
      apiKey: string('调用 /v1 接口时使用的 Bearer API Key。'),
      settings: ref('ProjectSettings'),
      createdAt: integer('创建时间，Unix epoch 毫秒。'),
      updatedAt: integer('最后更新时间，Unix epoch 毫秒。'),
      sessionCount: integer('项目会话总数；列表响应中提供。'),
      interactionCount: integer('项目交互总数；列表响应中提供。'),
      waitingCount: integer('等待人工处理的交互数；列表响应中提供。'),
    },
    ['id', 'name', 'description', 'apiKey', 'settings', 'createdAt', 'updatedAt'],
  ),
  ProjectInput: object(
    {
      name: string('项目名称，1-120 字符。', { minLength: 1, maxLength: 120 }),
      description: string('项目说明，最多 2000 字符。', { maxLength: 2000 }),
      apiKey: string('自定义项目 API Key，8-200 字符；不传则自动生成。', { minLength: 8, maxLength: 200 }),
      settings: { ...ref('ProjectSettings'), description: '仅需传要覆盖的项目设置字段。' },
    },
    ['name'],
  ),
  UpdateProjectInput: object({
    name: string('新项目名称，1-120 字符。', { minLength: 1, maxLength: 120 }),
    description: string('新项目说明，最多 2000 字符。', { maxLength: 2000 }),
    apiKey: string('新 API Key，8-200 字符。', { minLength: 8, maxLength: 200 }),
    settings: { ...ref('ProjectSettings'), description: '仅需传要修改的设置字段。' },
  }),
  Session: object(
    {
      id: string('会话唯一标识。'),
      projectId: string('所属项目 ID。'),
      name: string('会话名称。'),
      description: string('会话说明。'),
      status: string('会话状态。', { enum: ['active', 'completed', 'archived'] }),
      tags: array(string('标签文本。'), '会话标签。'),
      externalId: nullable(string('Agent 通过 URL 指定的外部会话 ID。')),
      auto: boolean('是否由服务端在未指定会话时自动创建。'),
      replaySourceId: nullable(string('Replay 会话引用的源会话 ID。')),
      metadata: object({}, [], '调用方自定义元数据。', true),
      ruleIds: array(string('规则 ID。'), '该会话启用的规则 ID。'),
      scenarioIds: array(string('场景 ID。'), '该会话启用的场景 ID。'),
      interactionCount: integer('会话内交互总数。'),
      waitingCount: integer('等待人工处理的交互数。'),
      startedAt: integer('会话开始时间，Unix epoch 毫秒。'),
      endedAt: nullable(integer('会话结束时间，Unix epoch 毫秒。')),
      lastActivityAt: integer('最近活动时间，Unix epoch 毫秒。'),
    },
    [
      'id', 'projectId', 'name', 'description', 'status', 'tags', 'externalId', 'auto',
      'replaySourceId', 'metadata', 'ruleIds', 'scenarioIds', 'interactionCount',
      'startedAt', 'endedAt', 'lastActivityAt',
    ],
  ),
  SessionInput: object({
    name: string('会话名称；不传则自动生成。', { minLength: 1, maxLength: 200 }),
    description: string('会话说明。', { maxLength: 2000 }),
    tags: array(string('标签，最多 50 字符。', { maxLength: 50 }), '最多 20 个标签。'),
    externalId: string('URL 会话外部标识。', { minLength: 1, maxLength: 200 }),
    metadata: object({}, [], '调用方自定义元数据。', true),
    ruleIds: array(string('规则 ID。'), '会话启用的规则，最多 500 个。'),
    scenarioIds: array(string('场景 ID。'), '会话启用的场景，最多 500 个。'),
  }),
  UpdateSessionInput: object({
    name: string('新会话名称。', { minLength: 1, maxLength: 200 }),
    description: string('新会话说明。', { maxLength: 2000 }),
    status: string('新会话状态。', { enum: ['active', 'completed', 'archived'] }),
    tags: array(string('标签。'), '替换后的标签列表。'),
    metadata: object({}, [], '替换后的自定义元数据。', true),
    ruleIds: array(string('规则 ID。'), '替换后的规则 ID 列表。'),
    scenarioIds: array(string('场景 ID。'), '替换后的场景 ID 列表。'),
  }),
  RuleCondition: {
    description: '规则匹配条件；all/any/not 可递归组合。',
    oneOf: [
      object({ type: { const: 'always', description: '始终匹配。' } }, ['type']),
      object({ type: { enum: ['contains', 'equals'], description: '文本比较类型。' }, value: string('匹配文本。'), target: string('匹配目标。', { enum: ['last_user_message', 'last_message', 'all_messages', 'system_prompt', 'raw_request'] }), ignoreCase: boolean('是否忽略大小写。') }, ['type', 'value']),
      object({ type: { const: 'regex' }, value: string('正则表达式。'), target: string('匹配目标。', { enum: ['last_user_message', 'last_message', 'all_messages', 'system_prompt', 'raw_request'] }), flags: string('JavaScript 正则 flags，例如 i、m。') }, ['type', 'value']),
      object({ type: { enum: ['model', 'tool'], description: '按模型名或 Tool 名匹配。' }, value: string('要匹配的名称。') }, ['type', 'value']),
      object({ type: { enum: ['message_count', 'sequence_index'], description: '按消息数或交互序号匹配。' }, op: string('比较运算符。', { enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'regex', 'exists'] }), value: number('比较值。') }, ['type', 'op', 'value']),
      object({ type: { const: 'jsonpath' }, path: string('JSONPath 路径。'), op: string('比较运算符。', { enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'regex', 'exists'] }), value: { description: '比较值；exists 运算可省略。' } }, ['type', 'path', 'op']),
      object({ type: { enum: ['all', 'any'], description: '所有条件成立或任一条件成立。' }, conditions: array(ref('RuleCondition'), '子条件列表。') }, ['type', 'conditions']),
      object({ type: { const: 'not' }, condition: ref('RuleCondition') }, ['type', 'condition']),
    ],
  },
  ToolCallSpec: object(
    {
      id: string('可选 Tool Call ID；不传则自动生成。'),
      name: string('函数名称。'),
      arguments: { description: '函数参数，可传 JSON 字符串或对象。', anyOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }] },
    },
    ['name'],
  ),
  MockAction: {
    description: 'Mock 执行动作；sequence 可递归组合多个动作。',
    oneOf: [
      object({ type: { const: 'assistant' }, content: string('助手回复文本。'), finishReason: string('结束原因。', { enum: ['stop', 'length', 'tool_calls', 'content_filter'] }) }, ['type', 'content']),
      object({ type: { const: 'think' }, content: string('推理/思考文本。') }, ['type', 'content']),
      object({ type: { const: 'tool_call' }, toolCalls: array(ref('ToolCallSpec'), '要发出的 Tool Calls。'), content: string('可选伴随文本。') }, ['type', 'toolCalls']),
      object({ type: { const: 'tool_result' }, tool: string('Tool 名称。'), result: { description: 'Tool 返回值。' }, toolCallId: string('对应 Tool Call ID。') }, ['type', 'tool']),
      object({ type: { const: 'delay' }, ms: integer('延迟毫秒数。', { minimum: 0, maximum: 600000 }) }, ['type', 'ms']),
      object({ type: { const: 'error' }, status: integer('HTTP 状态码。', { minimum: 400, maximum: 599 }), message: string('错误信息。'), errorType: string('OpenAI 错误类型。'), code: nullable(string('OpenAI 错误代码。')) }, ['type', 'status', 'message']),
      object({ type: { enum: ['timeout', 'manual'], description: '模拟超时或转人工等待。' } }, ['type']),
      object({ type: { const: 'sequence' }, actions: array(ref('MockAction'), '按顺序执行的动作。') }, ['type', 'actions']),
    ],
  },
  Rule: object(
    {
      id: string('规则 ID。'), projectId: string('所属项目 ID。'), name: string('规则名称。'),
      description: string('规则说明。'), enabled: boolean('是否启用。'), priority: integer('匹配优先级，数值越小越先匹配。'),
      condition: ref('RuleCondition'), action: ref('MockAction'), matchCount: integer('累计命中次数。'),
      createdAt: integer('创建时间，Unix epoch 毫秒。'), updatedAt: integer('更新时间，Unix epoch 毫秒。'),
    },
    ['id', 'projectId', 'name', 'description', 'enabled', 'priority', 'condition', 'action', 'matchCount', 'createdAt', 'updatedAt'],
  ),
  RuleInput: object({
    name: string('规则名称。', { minLength: 1, maxLength: 120 }), description: string('规则说明。', { maxLength: 2000 }),
    enabled: boolean('是否启用。'), priority: integer('优先级，-999 到 999。', { minimum: -999, maximum: 999 }),
    condition: ref('RuleCondition'), action: ref('MockAction'),
  }, ['name', 'condition', 'action']),
  ScenarioStep: object({
    id: string('步骤 ID。'), scenarioId: string('所属场景 ID。'), sequence: integer('步骤序号，从 0 开始。'),
    name: string('步骤名称。'), condition: nullable(ref('RuleCondition')), action: ref('MockAction'),
    createdAt: integer('创建时间，Unix epoch 毫秒。'),
  }, ['id', 'scenarioId', 'sequence', 'name', 'condition', 'action', 'createdAt']),
  ScenarioStepInput: object({
    id: string('已有步骤 ID；更新时用于保留步骤身份。'), name: string('步骤名称。', { maxLength: 120 }),
    condition: nullable(ref('RuleCondition')), action: ref('MockAction'),
  }, ['action']),
  Scenario: object({
    id: string('场景 ID。'), projectId: string('所属项目 ID。'), name: string('场景名称。'), description: string('场景说明。'),
    enabled: boolean('是否启用。'), trigger: nullable(ref('RuleCondition')), loop: boolean('最后一步完成后是否回到第一步。'),
    steps: array(ref('ScenarioStep'), '按 sequence 排序的步骤。'), createdAt: integer('创建时间，Unix epoch 毫秒。'), updatedAt: integer('更新时间，Unix epoch 毫秒。'),
  }, ['id', 'projectId', 'name', 'description', 'enabled', 'trigger', 'loop', 'steps', 'createdAt', 'updatedAt']),
  ScenarioInput: object({
    name: string('场景名称。', { minLength: 1, maxLength: 120 }), description: string('场景说明。', { maxLength: 2000 }),
    enabled: boolean('是否启用。'), trigger: nullable(ref('RuleCondition')), loop: boolean('是否循环。'),
    steps: array(ref('ScenarioStepInput'), '场景步骤，最多 200 个。'),
  }, ['name']),
  Tool: object({
    id: string('Tool ID。'), projectId: string('所属项目 ID。'), name: string('Tool 函数名。'), description: string('Tool 说明。'),
    parameters: object({}, [], 'JSON Schema 形式的函数参数定义。', true),
    responseMode: string('响应模式。', { enum: ['static', 'template', 'random', 'sequence', 'error'] }),
    response: { description: 'static/template 模式的响应。' }, responses: array({}, 'random/sequence 模式的候选响应。'),
    errorMessage: string('error 模式的错误信息。'), delayMs: integer('调用延迟毫秒数。'), cursor: integer('sequence 模式当前游标。'),
    createdAt: integer('创建时间，Unix epoch 毫秒。'), updatedAt: integer('更新时间，Unix epoch 毫秒。'),
  }, ['id', 'projectId', 'name', 'description', 'parameters', 'responseMode', 'responses', 'errorMessage', 'delayMs', 'cursor', 'createdAt', 'updatedAt']),
  ToolInput: object({
    name: string('Tool 名称，仅允许字母、数字、下划线、点和短横线。', { pattern: '^[a-zA-Z0-9_.-]+$', maxLength: 80 }),
    description: string('Tool 说明。', { maxLength: 2000 }), parameters: object({}, [], 'JSON Schema 参数定义。', true),
    responseMode: string('响应模式。', { enum: ['static', 'template', 'random', 'sequence', 'error'] }), response: { description: '单个响应值。' },
    responses: array({}, '候选响应列表，最多 100 个。'), errorMessage: string('错误响应文本。', { maxLength: 1000 }),
    delayMs: integer('模拟延迟毫秒数。', { minimum: 0, maximum: 600000 }),
  }, ['name']),
  ChatMessage: object({
    role: string('消息角色，例如 system、user、assistant、tool。'), content: { description: '消息内容；兼容字符串、多模态数组或 null。' },
    name: string('消息发送者名称。'), tool_calls: array(object({ id: string('Tool Call ID。'), type: string('固定为 function。', { enum: ['function'] }), function: object({ name: string('函数名。'), arguments: string('JSON 字符串形式的函数参数。') }, ['name', 'arguments']) }, ['id', 'type', 'function']), '助手发起的 Tool Calls。'),
    tool_call_id: string('Tool 消息对应的 Tool Call ID。'), reasoning_content: string('兼容模型的推理内容。'),
  }, ['role'], undefined, true),
  ChatCompletionRequest: object({
    model: string('模型名称；默认 mock-gpt。'), messages: array(ref('ChatMessage'), '对话消息，至少 1 条。'), stream: boolean('是否使用 SSE 流式响应。'),
    stream_options: object({ include_usage: boolean('是否在流结束前附加 usage chunk。') }, [], undefined, true),
    tools: array(object({ type: string('Tool 类型，通常为 function。'), function: object({ name: string('函数名。'), description: string('函数说明。'), parameters: { description: 'JSON Schema 参数定义。' } }, ['name'], undefined, true) }, ['function'], undefined, true), '可调用工具。'),
    functions: array({}, '旧版 functions 参数。'), tool_choice: { description: 'Tool 选择策略，兼容 OpenAI 格式。' }, temperature: number('采样温度。'), top_p: number('核采样参数。'),
    max_tokens: integer('最大生成 token 数。'), max_completion_tokens: integer('最大 completion token 数。'), n: integer('候选回复数量。'), stop: { description: '停止序列。' },
    user: string('终端用户标识。'), metadata: object({}, [], '请求元数据。', true),
  }, ['messages'], '兼容 OpenAI Chat Completions 的请求体；未列出的扩展字段会被保留。', true),
  ChatCompletionResponse: object({
    id: string('Completion ID。'), object: string('固定为 chat.completion。', { enum: ['chat.completion'] }), created: integer('创建时间，Unix epoch 秒。'), model: string('响应模型名。'),
    system_fingerprint: string('可选系统指纹。'), choices: array(object({ index: integer('候选序号。'), message: object({ role: string('固定为 assistant。'), content: nullable(string('助手文本；Tool Call 响应可为 null。')), reasoning_content: string('推理内容。'), tool_calls: array({}, 'OpenAI 格式 Tool Calls。') }, ['role', 'content']), logprobs: { type: 'null', description: '当前固定为 null。' }, finish_reason: string('结束原因。', { enum: ['stop', 'length', 'tool_calls', 'content_filter'] }) }, ['index', 'message', 'logprobs', 'finish_reason']), '候选响应。'),
    usage: object({ prompt_tokens: integer('估算的输入 token 数。'), completion_tokens: integer('估算的输出 token 数。'), total_tokens: integer('总 token 数。') }, ['prompt_tokens', 'completion_tokens', 'total_tokens']),
  }, ['id', 'object', 'created', 'model', 'choices', 'usage']),
  InteractionEvent: object({ id: string('事件 ID。'), interactionId: string('所属交互 ID。'), sequence: integer('事件序号。'), type: string('事件类型。'), payload: object({}, [], '事件类型相关载荷。', true), createdAt: integer('创建时间，Unix epoch 毫秒。') }, ['id', 'interactionId', 'sequence', 'type', 'payload', 'createdAt']),
  Interaction: object({
    id: string('交互 ID。'), projectId: string('所属项目 ID。'), sessionId: string('所属会话 ID。'), sequence: integer('会话内交互序号。'),
    status: string('交互状态。', { enum: ['pending', 'streaming', 'completed', 'failed', 'cancelled'] }), mode: string('决策来源。', { enum: ['pending', 'manual', 'rule', 'scenario', 'replay', 'auto'] }), stream: boolean('原请求是否要求流式响应。'), model: string('请求模型。'),
    request: ref('ChatCompletionRequest'), requestHeaders: object({}, [], '原始请求头。', { type: 'string' }), response: nullable(ref('ChatCompletionResponse')),
    error: nullable(object({ status: integer('HTTP 状态码。'), message: string('错误信息。'), errorType: string('OpenAI 错误类型。'), code: nullable(string('错误代码。')) }, ['status', 'message', 'errorType', 'code'])),
    ruleId: nullable(string('命中的规则 ID。')), scenarioId: nullable(string('命中的场景 ID。')), latencyMs: nullable(integer('处理耗时毫秒数。')),
    createdAt: integer('创建时间，Unix epoch 毫秒。'), completedAt: nullable(integer('完成时间，Unix epoch 毫秒。')), events: array(ref('InteractionEvent'), '交互事件；可通过查询参数关闭。'),
  }, ['id', 'projectId', 'sessionId', 'sequence', 'status', 'mode', 'stream', 'model', 'request', 'requestHeaders', 'response', 'error', 'ruleId', 'scenarioId', 'latencyMs', 'createdAt', 'completedAt']),
  ApiLog: object({
    id: string('日志 ID。'), projectId: nullable(string('项目 ID。')), sessionId: nullable(string('会话 ID。')), interactionId: nullable(string('交互 ID。')),
    method: string('HTTP 方法。'), path: string('请求路径。'), status: integer('响应状态码。'), durationMs: number('请求耗时毫秒数。'),
    requestHeaders: object({}, [], '请求头。', { type: 'string' }), requestBody: { description: '请求体。' }, responseBody: { description: '响应体。' }, ip: string('客户端 IP。'), createdAt: integer('创建时间，Unix epoch 毫秒。'),
  }, ['id', 'projectId', 'sessionId', 'interactionId', 'method', 'path', 'status', 'durationMs', 'requestHeaders', 'ip', 'createdAt']),
  StreamEvent: object({
    type: string('事件类型。', { enum: ['ready', 'session.created', 'session.updated', 'session.deleted', 'interaction.created', 'interaction.updated', 'interaction.event', 'interaction.completed', 'ping'] }),
    projectId: string('项目 ID；ready 事件为空字符串。'), sessionId: string('关联会话 ID。'), interactionId: string('关联交互 ID。'), session: ref('Session'), interaction: ref('Interaction'), event: ref('InteractionEvent'), at: integer('事件时间，Unix epoch 毫秒。'),
  }, ['type', 'projectId', 'at']),
};

const errorResponses = { 400: ref('ErrorResponse'), 404: ref('ErrorResponse'), 409: ref('ErrorResponse'), 500: ref('ErrorResponse') };
const listResponse = (item: Schema): Schema => object({ items: array(item, '当前页数据。'), total: integer('符合条件的数据总数。'), limit: integer('本页最大条数。'), offset: integer('本页起始偏移。') }, ['items', 'total', 'limit', 'offset']);
const itemsResponse = (item: Schema): Schema => object({ items: array(item, '数据列表。') }, ['items']);
const pagingQuery = object({ limit: integer('每页条数。', { minimum: 1, maximum: 500 }), offset: integer('起始偏移。', { minimum: 0 }) });

function doc(operationId: string, tags: string[], summary: string, description: string, extra: Omit<RouteDoc, 'operationId' | 'tags' | 'summary' | 'description'> = {}): RouteDoc {
  return { operationId, tags, summary, description, ...extra };
}

const routeDocs: Record<string, RouteDoc> = {
  'GET /api/health': doc('getHealth', ['系统'], '健康检查', '返回进程存活状态和启动后的运行时长。', { response: { 200: object({ ok: boolean('服务是否正常。'), uptimeMs: integer('进程运行时长，毫秒。') }, ['ok', 'uptimeMs']) } }),
  'GET /api/system/info': doc('getSystemInfo', ['系统'], '获取系统信息', '返回服务地址、运行统计、配置开关和实时连接统计。', { response: { 200: object({ name: string('服务名称。'), version: string('服务版本。'), startedAt: integer('启动时间，Unix epoch 毫秒。'), databasePath: string('SQLite 数据库路径。'), baseUrl: string('管理 API 根地址。'), mockBaseUrl: string('OpenAI 兼容 API 根地址。'), projectCount: integer('项目数。'), sessionCount: integer('会话数。'), interactionCount: integer('交互数。'), pendingRequests: integer('等待人工处理的请求数。'), sseSubscribers: integer('SSE 订阅者数。'), strictApiKey: boolean('是否严格校验 API Key。') }, ['name', 'version', 'startedAt', 'databasePath', 'baseUrl', 'mockBaseUrl', 'projectCount', 'sessionCount', 'interactionCount', 'pendingRequests', 'sseSubscribers', 'strictApiKey']) } }),
  'GET /api/projects': doc('listProjects', ['项目'], '项目列表', '列出全部项目，并附带会话、交互和待处理数量。', { response: { 200: itemsResponse(ref('Project')), ...errorResponses } }),
  'POST /api/projects': doc('createProject', ['项目'], '创建项目', '创建项目；API Key 和未提供的设置由服务端生成默认值。', { body: ref('ProjectInput'), response: { 201: ref('Project'), ...errorResponses } }),
  'GET /api/projects/:id': doc('getProject', ['项目'], '项目详情', '按项目 ID 获取完整项目配置。', { params: idParams('项目 ID。'), response: { 200: ref('Project'), ...errorResponses } }),
  'PUT /api/projects/:id': doc('updateProject', ['项目'], '更新项目', '部分更新项目基础信息、API Key 或设置。', { params: idParams('项目 ID。'), body: ref('UpdateProjectInput'), response: { 200: ref('Project'), ...errorResponses } }),
  'POST /api/projects/:id/rotate-key': doc('rotateProjectKey', ['项目'], '轮换 API Key', '生成新的项目 API Key，旧 Key 立即失效。', { params: idParams('项目 ID。'), response: { 200: ref('Project'), ...errorResponses } }),
  'GET /api/projects/:id/waiting': doc('listWaitingInteractions', ['项目'], '待人工处理交互', '列出项目中当前等待人工动作的交互。', { params: idParams('项目 ID。'), response: { 200: itemsResponse(ref('Interaction')), ...errorResponses } }),
  'DELETE /api/projects/:id': doc('deleteProject', ['项目'], '删除项目', '删除项目及其会话、交互、规则、场景、工具和日志。', { params: idParams('项目 ID。'), response: { 204: noContent, ...errorResponses } }),
  'GET /api/projects/:id/sessions': doc('listSessions', ['会话'], '会话列表', '分页查询项目会话，可按状态过滤。', { params: idParams('项目 ID。'), querystring: object({ ...((pagingQuery.properties as Record<string, Schema>)), status: string('会话状态。', { enum: ['active', 'completed', 'archived'] }) }), response: { 200: listResponse(ref('Session')), ...errorResponses } }),
  'POST /api/projects/:id/sessions': doc('createSession', ['会话'], '创建会话', '在指定项目中创建调试会话。', { params: idParams('项目 ID。'), body: ref('SessionInput'), response: { 201: ref('Session'), ...errorResponses } }),
  'GET /api/sessions/:id': doc('getSession', ['会话'], '会话详情', '按会话 ID 获取详情和统计。', { params: idParams('会话 ID。'), response: { 200: ref('Session'), ...errorResponses } }),
  'PUT /api/sessions/:id': doc('updateSession', ['会话'], '更新会话', '部分更新会话信息、状态和启用的规则/场景。', { params: idParams('会话 ID。'), body: ref('UpdateSessionInput'), response: { 200: ref('Session'), ...errorResponses } }),
  'DELETE /api/sessions/:id': doc('deleteSession', ['会话'], '删除会话', '删除会话及其交互和场景运行状态。', { params: idParams('会话 ID。'), response: { 204: noContent, ...errorResponses } }),
  'GET /api/sessions/:id/interactions': doc('listInteractions', ['交互'], '会话交互列表', '分页列出会话交互；events=false 可省略事件明细。', { params: idParams('会话 ID。'), querystring: object({ ...((pagingQuery.properties as Record<string, Schema>)), events: string('是否返回事件，字符串 false 表示不返回。', { enum: ['true', 'false'] }) }), response: { 200: listResponse(ref('Interaction')), ...errorResponses } }),
  'POST /api/sessions/:id/replay': doc('replaySession', ['会话'], '创建回放会话', '基于已有交互记录创建 Replay 会话，后续按原 sequence 复用响应。', { params: idParams('源会话 ID。'), body: object({ name: string('回放会话名称。', { maxLength: 200 }), description: string('回放会话说明。', { maxLength: 2000 }) }), response: { 201: ref('Session'), ...errorResponses } }),
  'POST /api/sessions/:id/reset-scenarios': doc('resetSessionScenarios', ['会话'], '重置场景游标', '清除该会话全部 Scenario 的执行进度。', { params: idParams('会话 ID。'), response: { 200: ok, ...errorResponses } }),
  'POST /api/sessions/:id/reset': doc('resetSession', ['会话'], '重置会话', '清除会话交互并恢复可重新调试的状态。', { params: idParams('会话 ID。'), response: { 200: ref('Session'), ...errorResponses } }),
  'GET /api/sessions/:id/scenario-runs': doc('listScenarioRuns', ['场景'], '场景运行状态', '列出会话内各场景当前执行游标。', { params: idParams('会话 ID。'), response: { 200: itemsResponse(object({ sessionId: string('会话 ID。'), scenarioId: string('场景 ID。'), cursor: integer('下一步执行游标。'), updatedAt: integer('更新时间，Unix epoch 毫秒。') }, ['sessionId', 'scenarioId', 'cursor', 'updatedAt'])), ...errorResponses } }),
  'GET /api/interactions/:id': doc('getInteraction', ['交互'], '交互详情', '获取请求、响应、决策来源和完整事件。', { params: idParams('交互 ID。'), response: { 200: ref('Interaction'), ...errorResponses } }),
  'POST /api/interactions/:id/reply': doc('replyInteraction', ['人工控制'], '人工回复', '向等待中的交互发送助手文本，可附加延迟。', { params: idParams('交互 ID。'), body: object({ content: string('回复文本。'), finishReason: string('结束原因。', { enum: ['stop', 'length', 'tool_calls', 'content_filter'] }), delayMs: integer('发送前延迟毫秒数。', { minimum: 0, maximum: 600000 }) }, ['content']), response: { 200: ref('ManualActionResult'), ...errorResponses } }),
  'POST /api/interactions/:id/think': doc('thinkInteraction', ['人工控制'], '发送 Think', '向流中追加推理内容，不会单独终结交互。', { params: idParams('交互 ID。'), body: object({ content: string('非空推理文本。') }, ['content']), response: { 200: ref('ManualActionResult'), ...errorResponses } }),
  'POST /api/interactions/:id/tool-call': doc('toolCallInteraction', ['人工控制'], '发送 Tool Call', '发送一个或多个 Tool Call；可用 name+arguments 作为单调用简写。', { params: idParams('交互 ID。'), body: object({ toolCalls: array(ref('ToolCallSpec'), 'Tool Call 列表。'), name: string('单 Tool Call 简写的函数名。'), arguments: { description: '单 Tool Call 简写的参数。' }, content: string('伴随文本。'), delayMs: integer('发送前延迟毫秒数。') }), response: { 200: ref('ManualActionResult'), ...errorResponses } }),
  'POST /api/interactions/:id/tool-result': doc('toolResultInteraction', ['人工控制'], '发送 Tool Result', '记录 Tool 结果；useToolConfig=true 时从已配置 Tool 生成结果。', { params: idParams('交互 ID。'), body: object({ tool: string('Tool 名称。'), result: { description: 'Tool 结果。' }, toolCallId: string('对应 Tool Call ID。'), useToolConfig: boolean('是否忽略 result 并使用 Tool mock 配置。') }, ['tool']), response: { 200: ref('ManualActionResult'), ...errorResponses } }),
  'POST /api/interactions/:id/error': doc('errorInteraction', ['人工控制'], '发送错误', '以指定 HTTP 状态和 OpenAI 错误信息终结交互。', { params: idParams('交互 ID。'), body: object({ status: integer('HTTP 状态码，400-599。', { minimum: 400, maximum: 599 }), message: string('错误信息。'), errorType: string('OpenAI 错误类型。'), code: nullable(string('错误代码。')) }, ['status', 'message']), response: { 200: ref('ManualActionResult'), ...errorResponses } }),
  'POST /api/interactions/:id/timeout': doc('timeoutInteraction', ['人工控制'], '模拟超时', '以超时动作终结等待中的交互。', { params: idParams('交互 ID。'), response: { 200: ref('ManualActionResult'), ...errorResponses } }),
  'POST /api/interactions/:id/upstream': doc('forwardInteraction', ['人工控制'], '转发上游 AI', '把原请求转发到项目配置的 OpenAI 兼容上游，并将结果应用到当前交互。', { params: idParams('交互 ID。'), body: object({ upstreamId: string('指定多上游配置 ID；不传则使用默认上游。'), model: string('覆盖转发模型。') }), response: { 200: ref('ManualActionResult'), ...errorResponses } }),
  'POST /api/interactions/:id/action': doc('actionInteraction', ['人工控制'], '执行通用动作', '直接提交任意 MockAction，包括 sequence 组合动作。', { params: idParams('交互 ID。'), body: object({ action: ref('MockAction') }, ['action']), response: { 200: ref('ManualActionResult'), ...errorResponses } }),
  'POST /api/upstreams/models': doc('listUpstreamModels', ['上游'], '探测上游模型', '使用临时连接信息调用上游 /models，返回可选模型 ID。', { body: object({ baseUrl: string('OpenAI 兼容 API 根地址。', { format: 'uri' }), apiKey: string('上游 API Key。', { maxLength: 500 }) }, ['baseUrl', 'apiKey']), response: { 200: object({ models: array(string('模型 ID。'), '上游模型 ID 列表。') }, ['models']), ...errorResponses } }),
  'GET /api/projects/:id/rules': doc('listRules', ['规则'], '规则列表', '列出项目全部规则。', { params: idParams('项目 ID。'), response: { 200: itemsResponse(ref('Rule')), ...errorResponses } }),
  'POST /api/projects/:id/rules': doc('createRule', ['规则'], '创建规则', '创建条件与动作组成的匹配规则。', { params: idParams('项目 ID。'), body: ref('RuleInput'), response: { 201: ref('Rule'), ...errorResponses } }),
  'PUT /api/rules/:id': doc('updateRule', ['规则'], '更新规则', '部分更新规则字段。', { params: idParams('规则 ID。'), body: { ...ref('RuleInput'), description: '所有字段均可选，仅更新传入字段。' }, response: { 200: ref('Rule'), ...errorResponses } }),
  'DELETE /api/rules/:id': doc('deleteRule', ['规则'], '删除规则', '删除指定规则。', { params: idParams('规则 ID。'), response: { 204: noContent, ...errorResponses } }),
  'GET /api/projects/:id/scenarios': doc('listScenarios', ['场景'], '场景列表', '列出项目全部多步骤场景。', { params: idParams('项目 ID。'), response: { 200: itemsResponse(ref('Scenario')), ...errorResponses } }),
  'POST /api/projects/:id/scenarios': doc('createScenario', ['场景'], '创建场景', '创建带触发条件和顺序步骤的场景。', { params: idParams('项目 ID。'), body: ref('ScenarioInput'), response: { 201: ref('Scenario'), ...errorResponses } }),
  'GET /api/scenarios/:id': doc('getScenario', ['场景'], '场景详情', '获取场景及完整步骤。', { params: idParams('场景 ID。'), response: { 200: ref('Scenario'), ...errorResponses } }),
  'PUT /api/scenarios/:id': doc('updateScenario', ['场景'], '更新场景', '部分更新场景；传 steps 时替换步骤集合。', { params: idParams('场景 ID。'), body: { ...ref('ScenarioInput'), description: '所有字段均可选。' }, response: { 200: ref('Scenario'), ...errorResponses } }),
  'POST /api/scenarios/:id/reset': doc('resetScenario', ['场景'], '重置场景运行', '清除该场景在所有会话中的执行游标。', { params: idParams('场景 ID。'), response: { 200: ok, ...errorResponses } }),
  'DELETE /api/scenarios/:id': doc('deleteScenario', ['场景'], '删除场景', '删除场景、步骤和运行记录。', { params: idParams('场景 ID。'), response: { 204: noContent, ...errorResponses } }),
  'GET /api/projects/:id/tools': doc('listTools', ['工具'], 'Tool 列表', '列出项目配置的全部 mock Tools。', { params: idParams('项目 ID。'), response: { 200: itemsResponse(ref('Tool')), ...errorResponses } }),
  'POST /api/projects/:id/tools/sync': doc('syncTools', ['工具'], '同步 Tools', '按项目和名称幂等同步 Agent 请求中的 Tool 定义。', { params: idParams('项目 ID。'), body: object({ tools: array(object({ name: string('Tool 名称。'), description: string('Tool 说明。'), parameters: object({}, [], 'JSON Schema 参数定义。', true) }, ['name']), '最多 200 个 Tool 定义。') }, ['tools']), response: { 200: array(ref('Tool'), '同步后的 Tools。'), ...errorResponses } }),
  'POST /api/projects/:id/tools': doc('createTool', ['工具'], '创建 Tool', '创建 Tool mock 响应配置，同项目名称不可重复。', { params: idParams('项目 ID。'), body: ref('ToolInput'), response: { 201: ref('Tool'), ...errorResponses } }),
  'PUT /api/tools/:id': doc('updateTool', ['工具'], '更新 Tool', '部分更新 Tool 配置。', { params: idParams('Tool ID。'), body: { ...ref('ToolInput'), description: '所有字段均可选。' }, response: { 200: ref('Tool'), ...errorResponses } }),
  'DELETE /api/tools/:id': doc('deleteTool', ['工具'], '删除 Tool', '删除指定 Tool。', { params: idParams('Tool ID。'), response: { 204: noContent, ...errorResponses } }),
  'POST /api/tools/:id/preview': doc('previewTool', ['工具'], '预览 Tool 响应', '使用请求体作为模板上下文生成一次响应；random/sequence 会推进游标。', { params: idParams('Tool ID。'), body: { type: 'object', description: '传给 Tool 模板的任意调用参数。', additionalProperties: true }, response: { 200: object({ result: { description: '解析后的 Tool 结果。' }, isError: boolean('是否为错误结果。'), delayMs: integer('配置的延迟毫秒数。') }, ['result', 'isError', 'delayMs']), ...errorResponses } }),
  'POST /api/tools/:id/reset-cursor': doc('resetToolCursor', ['工具'], '重置 Tool 游标', '把 sequence 响应模式的游标重置到第一项。', { params: idParams('Tool ID。'), response: { 200: ok, ...errorResponses } }),
  'GET /api/projects/:id/logs': doc('listApiLogs', ['日志'], 'API 日志', '分页查询项目请求日志，可按会话、状态、路径和时间范围过滤。', { params: idParams('项目 ID。'), querystring: object({ ...((pagingQuery.properties as Record<string, Schema>)), sessionId: string('会话 ID。'), status: integer('HTTP 状态码。'), path: string('路径模糊匹配。'), from: integer('开始时间，Unix epoch 毫秒。'), to: integer('结束时间，Unix epoch 毫秒。') }), response: { 200: listResponse(ref('ApiLog')), ...errorResponses } }),
  'DELETE /api/projects/:id/logs': doc('deleteApiLogs', ['日志'], '清空项目日志', '删除指定项目的全部 API 请求日志。', { params: idParams('项目 ID。'), response: { 204: noContent, ...errorResponses } }),
  'GET /api/projects/:id/events': doc('streamProjectEvents', ['事件流'], '订阅项目事件', 'SSE 长连接。事件名见 StreamEvent.type，data 为 StreamEvent JSON。', { params: idParams('项目 ID。'), produces: ['text/event-stream'], response: { 200: string('text/event-stream 数据流；每帧包含 event 和 data 行。'), ...errorResponses } }),
  'GET /api/sessions/:id/events': doc('streamSessionEvents', ['事件流'], '订阅会话事件', 'SSE 长连接，仅推送指定会话相关事件。', { params: idParams('会话 ID。'), produces: ['text/event-stream'], response: { 200: string('text/event-stream 数据流；data 字段符合 StreamEvent。'), ...errorResponses } }),
  'POST /v1/chat/completions': doc('createChatCompletion', ['OpenAI 兼容'], 'Chat Completions', 'OpenAI 兼容聊天补全。使用 Authorization: Bearer <project-api-key>；stream=true 时返回 SSE。', { security: [{ bearerAuth: [] }], body: ref('ChatCompletionRequest'), response: { 200: ref('ChatCompletionResponse'), 400: ref('OpenAiError'), 401: ref('OpenAiError'), 408: ref('OpenAiError'), 500: ref('OpenAiError') } }),
  'POST /:sessionId/v1/chat/completions': doc('createSessionChatCompletion', ['OpenAI 兼容'], '指定会话 Chat Completions', '与 /v1/chat/completions 相同，并用路径 sessionId 绑定或创建会话。', { security: [{ bearerAuth: [] }], params: sessionPathParams, body: ref('ChatCompletionRequest'), response: { 200: ref('ChatCompletionResponse'), 400: ref('OpenAiError'), 401: ref('OpenAiError'), 408: ref('OpenAiError'), 500: ref('OpenAiError') } }),
  'GET /v1/models': doc('listModels', ['OpenAI 兼容'], '模型列表', '返回 OpenAI 格式的可用模型列表。', { security: [{ bearerAuth: [] }], response: { 200: ref('ModelList'), 401: ref('OpenAiError') } }),
  'GET /:sessionId/v1/models': doc('listSessionModels', ['OpenAI 兼容'], '指定会话模型列表', '模型探测接口；sessionId 仅用于兼容带会话前缀的 Base URL。', { security: [{ bearerAuth: [] }], params: sessionPathParams, response: { 200: ref('ModelList'), 401: ref('OpenAiError') } }),
  'GET /v1/tools': doc('listMockTools', ['OpenAI 兼容'], 'Mock Tool 列表', '返回项目 Tool 的函数定义和响应模式。', { security: [{ bearerAuth: [] }], response: { 200: ref('MockToolList'), 401: ref('OpenAiError') } }),
  'GET /:sessionId/v1/tools': doc('listSessionMockTools', ['OpenAI 兼容'], '指定会话 Mock Tool 列表', 'Tool 探测接口；sessionId 用于兼容会话前缀 Base URL。', { security: [{ bearerAuth: [] }], params: sessionPathParams, response: { 200: ref('MockToolList'), 401: ref('OpenAiError') } }),
  'POST /v1/tools/:name': doc('invokeMockTool', ['OpenAI 兼容'], '调用 Mock Tool', '使用任意 JSON 请求体调用项目中同名 Tool，响应结构由 Tool 配置决定。', { security: [{ bearerAuth: [] }], params: object({ name: string('Tool 名称。') }, ['name']), body: { description: 'Tool 调用参数，允许任意 JSON。' }, response: { 200: { description: 'Tool 配置生成的任意 JSON 结果。' }, 401: ref('OpenAiError'), 404: { description: 'Tool 不存在。' }, 500: { description: 'Tool 配置为错误模式。' } } }),
  'POST /:sessionId/v1/tools/:name': doc('invokeSessionMockTool', ['OpenAI 兼容'], '指定会话调用 Mock Tool', '与 /v1/tools/{name} 相同，支持会话前缀 URL。', { security: [{ bearerAuth: [] }], params: object({ sessionId: string('URL 会话标识。'), name: string('Tool 名称。') }, ['sessionId', 'name']), body: { description: 'Tool 调用参数，允许任意 JSON。' }, response: { 200: { description: 'Tool 配置生成的任意 JSON 结果。' }, 401: ref('OpenAiError'), 404: { description: 'Tool 不存在。' }, 500: { description: 'Tool 配置为错误模式。' } } }),
};

schemas.ManualActionResult = object({ ok: boolean('动作是否已应用。'), terminal: boolean('该动作是否终结交互。'), events: array({}, '本次动作产生的已解析事件。'), interaction: ref('Interaction') }, ['ok', 'terminal', 'events', 'interaction']);
schemas.ModelList = object({ object: string('固定为 list。', { enum: ['list'] }), data: array(object({ id: string('模型 ID。'), object: string('固定为 model。', { enum: ['model'] }), created: integer('项目创建时间，Unix epoch 秒。'), owned_by: string('固定为 agent-mock。') }, ['id', 'object', 'created', 'owned_by']), '模型列表。') }, ['object', 'data']);
schemas.MockToolList = object({ object: string('固定为 list。', { enum: ['list'] }), data: array(object({ name: string('Tool 名称。'), description: string('Tool 说明。'), parameters: object({}, [], 'JSON Schema 参数定义。', true), response_mode: string('Mock 响应模式。', { enum: ['static', 'template', 'random', 'sequence', 'error'] }) }, ['name', 'description', 'parameters', 'response_mode']), 'Tool 定义列表。') }, ['object', 'data']);

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    transform: ({ schema, url, route }) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      const method = methods.find((item) => item !== 'HEAD');
      const documented = method ? routeDocs[`${method} ${url}`] : undefined;
      return { schema: documented ?? schema, url };
    },
    openapi: {
      info: {
        title: 'AI Agent Mock Server API',
        description: 'AI runtime simulator 的管理 API、实时事件流和 OpenAI 兼容 Mock API。所有时间字段如无特别说明均为 Unix epoch 毫秒。',
        version: config.version,
      },
      tags: [
        { name: '系统', description: '健康检查与运行信息。' }, { name: '项目', description: '项目及 API Key 管理。' },
        { name: '会话', description: '调试会话与回放。' }, { name: '交互', description: 'Agent 请求与响应记录。' },
        { name: '人工控制', description: '处理等待中的 Agent 请求。' }, { name: '规则', description: '条件匹配规则。' },
        { name: '场景', description: '多步骤 Scenario。' }, { name: '工具', description: 'Mock Tool 配置。' },
        { name: '上游', description: 'OpenAI 兼容上游探测。' }, { name: '日志', description: 'API 请求日志。' },
        { name: '事件流', description: '项目和会话 SSE 实时事件。' }, { name: 'OpenAI 兼容', description: '供 Agent/SDK 调用的 /v1 接口。' },
      ],
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'API Key', description: '项目 API Key。' } },
        schemas,
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true, displayRequestDuration: true },
    staticCSP: true,
  });

  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method === 'HEAD') continue;
      const key = `${method} ${route.url}`;
      const schema = routeDocs[key];
      if (!schema && (route.url.startsWith('/api') || route.url.startsWith('/v1') || route.url.includes('/v1/'))) {
        throw new Error(`缺少 OpenAPI 文档：${key}`);
      }
    }
  });
}
