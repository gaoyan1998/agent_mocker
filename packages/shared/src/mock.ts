import { z } from 'zod';
import { FINISH_REASONS, type FinishReason } from './openai.js';

/**
 * Mock 行为模型：Condition（什么时候）+ Action（做什么）+ Event（实际发生了什么）。
 *
 * Rule 与 Scenario Step 共用同一套 Condition / Action，因此前端的条件编辑器
 * 和动作编辑器可以完全复用。
 */

// ---------------------------------------------------------------- Condition

export const CONDITION_TARGETS = [
  'last_user_message',
  'last_message',
  'all_messages',
  'system_prompt',
  'raw_request',
] as const;
export type ConditionTarget = (typeof CONDITION_TARGETS)[number];

export const COMPARE_OPS = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'regex',
  'exists',
] as const;
export type CompareOp = (typeof COMPARE_OPS)[number];

export type RuleCondition =
  | { type: 'always' }
  | { type: 'contains'; value: string; target?: ConditionTarget; ignoreCase?: boolean }
  | { type: 'equals'; value: string; target?: ConditionTarget; ignoreCase?: boolean }
  | { type: 'regex'; value: string; target?: ConditionTarget; flags?: string }
  | { type: 'model'; value: string }
  | { type: 'tool'; value: string }
  | { type: 'message_count'; op: CompareOp; value: number }
  | { type: 'sequence_index'; op: CompareOp; value: number }
  | { type: 'jsonpath'; path: string; op: CompareOp; value?: unknown }
  | { type: 'all'; conditions: RuleCondition[] }
  | { type: 'any'; conditions: RuleCondition[] }
  | { type: 'not'; condition: RuleCondition };

export type RuleConditionType = RuleCondition['type'];

export const CONDITION_TYPES: RuleConditionType[] = [
  'always',
  'contains',
  'equals',
  'regex',
  'model',
  'tool',
  'message_count',
  'sequence_index',
  'jsonpath',
  'all',
  'any',
  'not',
];

const conditionTargetSchema = z.enum(CONDITION_TARGETS);
const compareOpSchema = z.enum(COMPARE_OPS);

export const ruleConditionSchema: z.ZodType<RuleCondition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('always') }),
    z.object({
      type: z.literal('contains'),
      value: z.string(),
      target: conditionTargetSchema.optional(),
      ignoreCase: z.boolean().optional(),
    }),
    z.object({
      type: z.literal('equals'),
      value: z.string(),
      target: conditionTargetSchema.optional(),
      ignoreCase: z.boolean().optional(),
    }),
    z.object({
      type: z.literal('regex'),
      value: z.string(),
      target: conditionTargetSchema.optional(),
      flags: z.string().optional(),
    }),
    z.object({ type: z.literal('model'), value: z.string() }),
    z.object({ type: z.literal('tool'), value: z.string() }),
    z.object({ type: z.literal('message_count'), op: compareOpSchema, value: z.number() }),
    z.object({ type: z.literal('sequence_index'), op: compareOpSchema, value: z.number() }),
    z.object({
      type: z.literal('jsonpath'),
      path: z.string(),
      op: compareOpSchema,
      value: z.unknown().optional(),
    }),
    z.object({ type: z.literal('all'), conditions: z.array(ruleConditionSchema) }),
    z.object({ type: z.literal('any'), conditions: z.array(ruleConditionSchema) }),
    z.object({ type: z.literal('not'), condition: ruleConditionSchema }),
  ]),
);

// ------------------------------------------------------------------- Action

export interface MockToolCallSpec {
  id?: string;
  name: string;
  /** 允许字符串（原样透传）或对象（序列化后透传）。 */
  arguments?: string | Record<string, unknown>;
}

export type MockAction =
  | { type: 'assistant'; content: string; finishReason?: FinishReason }
  | { type: 'think'; content: string }
  | { type: 'tool_call'; toolCalls: MockToolCallSpec[]; content?: string }
  | { type: 'tool_result'; tool: string; result?: unknown; toolCallId?: string }
  | { type: 'delay'; ms: number }
  | {
      type: 'error';
      status: number;
      message: string;
      errorType?: string;
      code?: string | null;
    }
  | { type: 'timeout' }
  | { type: 'manual' }
  | { type: 'sequence'; actions: MockAction[] };

export type MockActionType = MockAction['type'];

export const ACTION_TYPES: MockActionType[] = [
  'assistant',
  'think',
  'tool_call',
  'tool_result',
  'delay',
  'error',
  'timeout',
  'manual',
  'sequence',
];

export const mockToolCallSpecSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  arguments: z.union([z.string(), z.record(z.unknown())]).optional(),
});

export const mockActionSchema: z.ZodType<MockAction> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('assistant'),
      content: z.string(),
      finishReason: z.enum(FINISH_REASONS).optional(),
    }),
    z.object({ type: z.literal('think'), content: z.string() }),
    z.object({
      type: z.literal('tool_call'),
      toolCalls: z.array(mockToolCallSpecSchema).min(1),
      content: z.string().optional(),
    }),
    z.object({
      type: z.literal('tool_result'),
      tool: z.string().min(1),
      result: z.unknown().optional(),
      toolCallId: z.string().optional(),
    }),
    z.object({ type: z.literal('delay'), ms: z.number().int().min(0).max(600_000) }),
    z.object({
      type: z.literal('error'),
      status: z.number().int().min(400).max(599),
      message: z.string(),
      errorType: z.string().optional(),
      code: z.string().nullable().optional(),
    }),
    z.object({ type: z.literal('timeout') }),
    z.object({ type: z.literal('manual') }),
    z.object({ type: z.literal('sequence'), actions: z.array(mockActionSchema) }),
  ]),
);

// -------------------------------------------------------------------- Event

export interface ResolvedToolCall {
  id: string;
  name: string;
  /** 始终是 JSON 字符串，与 OpenAI 协议一致。 */
  arguments: string;
}

/**
 * MockEvent 是 Action 被“执行”后的产物，顺序即时间顺序。
 * 传输层（JSON / SSE）只消费 MockEvent，不再关心 Rule/Scenario/Manual 的来源。
 */
export type MockEvent =
  | { type: 'think'; content: string }
  | { type: 'assistant'; content: string; finishReason?: FinishReason }
  | { type: 'tool_call'; toolCalls: ResolvedToolCall[]; content?: string }
  | { type: 'tool_result'; tool: string; result: unknown; toolCallId?: string }
  | { type: 'delay'; ms: number }
  | {
      type: 'error';
      status: number;
      message: string;
      errorType: string;
      code: string | null;
    };

export type MockEventType = MockEvent['type'];

/** 会终结一次 Interaction 的事件类型；其余事件只是过程。 */
export const TERMINAL_EVENT_TYPES: MockEventType[] = ['assistant', 'tool_call', 'error'];

export function isTerminalEvent(event: MockEvent): boolean {
  return TERMINAL_EVENT_TYPES.includes(event.type);
}

// ----------------------------------------------------------------- Decision

export interface MockErrorSpec {
  status: number;
  message: string;
  errorType: string;
  code: string | null;
}

export interface MockDecisionMeta {
  mode: InteractionMode;
  ruleId?: string | null;
  ruleName?: string | null;
  scenarioId?: string | null;
  scenarioName?: string | null;
  scenarioStepId?: string | null;
  reason: string;
}

/**
 * Controller 不做业务判断，只把 Decision 交给传输层。
 * `response` / `stream` 携带同一份 MockEvent 列表，区别只是传输方式。
 */
export type MockDecision =
  | { type: 'response'; events: MockEvent[]; meta: MockDecisionMeta }
  | { type: 'stream'; events: MockEvent[]; meta: MockDecisionMeta }
  /** 挂起等待人工操作；`events` 是挂起前先自动播放的事件（可为空）。 */
  | { type: 'pending'; events: MockEvent[]; meta: MockDecisionMeta }
  | { type: 'error'; error: MockErrorSpec; meta: MockDecisionMeta };

// ------------------------------------------------------------------- 常量

export const INTERACTION_MODES = [
  'pending',
  'manual',
  'rule',
  'scenario',
  'replay',
  'auto',
] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];

export const INTERACTION_STATUSES = [
  'pending',
  'waiting',
  'completed',
  'error',
  'timeout',
  'aborted',
] as const;
export type InteractionStatus = (typeof INTERACTION_STATUSES)[number];

export const INTERACTION_EVENT_TYPES = [
  'request',
  'decision',
  'think',
  'tool_call',
  'tool_result',
  'assistant',
  'delay',
  'error',
] as const;
export type InteractionEventType = (typeof INTERACTION_EVENT_TYPES)[number];

export const SESSION_STATUSES = ['active', 'completed', 'archived'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const DEFAULT_BEHAVIORS = ['manual', 'echo', 'fixed', 'error'] as const;
export type DefaultBehavior = (typeof DEFAULT_BEHAVIORS)[number];

export const THINK_MODES = ['reasoning_content', 'content_tag', 'both'] as const;
export type ThinkMode = (typeof THINK_MODES)[number];

export const TOOL_RESPONSE_MODES = [
  'static',
  'template',
  'random',
  'sequence',
  'error',
] as const;
export type ToolResponseMode = (typeof TOOL_RESPONSE_MODES)[number];

/** 预置的错误模板。 */
export const ERROR_PRESETS: Array<{
  label: string;
  status: number;
  message: string;
  errorType: string;
  code: string | null;
}> = [
  {
    label: '400 Bad Request',
    status: 400,
    message: 'Invalid request payload',
    errorType: 'invalid_request_error',
    code: null,
  },
  {
    label: '401 Unauthorized',
    status: 401,
    message: 'Incorrect API key provided',
    errorType: 'invalid_request_error',
    code: 'invalid_api_key',
  },
  {
    label: '403 Forbidden',
    status: 403,
    message: 'You are not allowed to access this model',
    errorType: 'invalid_request_error',
    code: 'access_denied',
  },
  {
    label: '404 Not Found',
    status: 404,
    message: 'The model does not exist',
    errorType: 'invalid_request_error',
    code: 'model_not_found',
  },
  {
    label: '408 Request Timeout',
    status: 408,
    message: 'Request timed out',
    errorType: 'timeout_error',
    code: 'request_timeout',
  },
  {
    label: '429 Too Many Requests',
    status: 429,
    message: 'Rate limit exceeded',
    errorType: 'rate_limit_error',
    code: 'rate_limit',
  },
  {
    label: '500 Internal Server Error',
    status: 500,
    message: 'The server had an error while processing your request',
    errorType: 'server_error',
    code: null,
  },
  {
    label: '502 Bad Gateway',
    status: 502,
    message: 'Bad gateway',
    errorType: 'server_error',
    code: null,
  },
  {
    label: '503 Service Unavailable',
    status: 503,
    message: 'The engine is currently overloaded, please try again later',
    errorType: 'server_error',
    code: 'engine_overloaded',
  },
];
