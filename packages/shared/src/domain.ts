import type { ChatCompletionRequest, ChatCompletionResponse } from './openai.js';
import type {
  DefaultBehavior,
  InteractionEventType,
  InteractionMode,
  InteractionStatus,
  MockAction,
  MockErrorSpec,
  RuleCondition,
  SessionStatus,
  ThinkMode,
  ToolResponseMode,
} from './mock.js';

/**
 * 管理 API（/api/*）返回的数据结构。
 * 时间统一是 epoch 毫秒数，前端用 dayjs 格式化。
 */

export interface ProjectSettings {
  /** 没有 Rule / Scenario 命中时的兜底行为。 */
  defaultBehavior: DefaultBehavior;
  /** defaultBehavior = 'fixed' 时返回的固定内容。 */
  fixedReply: string;
  /** defaultBehavior = 'manual' 时，等待人工回复的超时时间。 */
  manualTimeoutMs: number;
  /** 所有响应统一附加的延迟。 */
  responseDelayMs: number;
  /** 流式响应每个 chunk 之间的间隔。 */
  streamChunkIntervalMs: number;
  /** 流式响应每个 chunk 的字符数。 */
  streamChunkSize: number;
  /** Think 内容的承载方式：reasoning_content 字段 / <think> 标签 / 两者都发。 */
  thinkMode: ThinkMode;
  /** URL 未携带会话 ID 时，自动 Session 的空闲复用窗口。 */
  autoSessionIdleMs: number;
  /** 响应里回显的默认 model 名（请求未指定时使用）。 */
  defaultModel: string;
  /** 人工操作时可选的真实上游 OpenAI 兼容 API。 */
  upstreamEnabled: boolean;
  upstreamBaseUrl: string;
  upstreamApiKey: string;
  upstreamModel: string;
  upstreams: UpstreamConfig[];
}

export interface UpstreamConfig {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  defaultBehavior: 'manual',
  fixedReply: '这是 Mock Server 返回的固定回复。',
  manualTimeoutMs: 300_000,
  responseDelayMs: 0,
  streamChunkIntervalMs: 30,
  streamChunkSize: 2,
  thinkMode: 'reasoning_content',
  autoSessionIdleMs: 1_800_000,
  defaultModel: 'mock-gpt',
  upstreamEnabled: false,
  upstreamBaseUrl: 'https://api.openai.com/v1',
  upstreamApiKey: '',
  upstreamModel: '',
  upstreams: [],
};

export interface Project {
  id: string;
  name: string;
  description: string;
  apiKey: string;
  settings: ProjectSettings;
  createdAt: number;
  updatedAt: number;
  /** 列表接口附带的统计信息。 */
  sessionCount?: number;
  interactionCount?: number;
  waitingCount?: number;
}

export interface DebugSession {
  id: string;
  projectId: string;
  name: string;
  description: string;
  status: SessionStatus;
  tags: string[];
  /** Agent 通过 URL 路径指定的外部会话 ID。 */
  externalId: string | null;
  /** 是否由 Server 自动创建（Agent 未指定 Session）。 */
  auto: boolean;
  /** Replay 模式下引用的源 Session。 */
  replaySourceId: string | null;
  metadata: Record<string, unknown>;
  /** 本会话启用的规则/场景；为空表示不启用任何项目配置。 */
  ruleIds: string[];
  scenarioIds: string[];
  interactionCount: number;
  waitingCount?: number;
  startedAt: number;
  endedAt: number | null;
  lastActivityAt: number;
}

export interface InteractionEvent {
  id: string;
  interactionId: string;
  sequence: number;
  type: InteractionEventType;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface Interaction {
  id: string;
  projectId: string;
  sessionId: string;
  sequence: number;
  status: InteractionStatus;
  mode: InteractionMode;
  stream: boolean;
  model: string;
  request: ChatCompletionRequest;
  requestHeaders: Record<string, string>;
  response: ChatCompletionResponse | null;
  error: MockErrorSpec | null;
  ruleId: string | null;
  scenarioId: string | null;
  latencyMs: number | null;
  createdAt: number;
  completedAt: number | null;
  events?: InteractionEvent[];
}

export interface Rule {
  id: string;
  projectId: string;
  name: string;
  description: string;
  enabled: boolean;
  /** 数值越小越先匹配。 */
  priority: number;
  condition: RuleCondition;
  action: MockAction;
  matchCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ScenarioStep {
  id: string;
  scenarioId: string;
  sequence: number;
  name: string;
  /** null 表示“任意请求都匹配”。 */
  condition: RuleCondition | null;
  action: MockAction;
  createdAt: number;
}

export interface Scenario {
  id: string;
  projectId: string;
  name: string;
  description: string;
  enabled: boolean;
  /** 整个 Scenario 的进入条件，null 表示任意请求都可进入。 */
  trigger: RuleCondition | null;
  /** 走完最后一步后是否从第一步重新开始。 */
  loop: boolean;
  steps: ScenarioStep[];
  createdAt: number;
  updatedAt: number;
}

export interface ScenarioRun {
  sessionId: string;
  scenarioId: string;
  cursor: number;
  updatedAt: number;
}

export interface MockTool {
  id: string;
  projectId: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  responseMode: ToolResponseMode;
  /** static / template 模式使用。 */
  response: unknown;
  /** random / sequence 模式使用。 */
  responses: unknown[];
  errorMessage: string;
  delayMs: number;
  /** sequence 模式的游标。 */
  cursor: number;
  createdAt: number;
  updatedAt: number;
}

export interface ApiLog {
  id: string;
  projectId: string | null;
  sessionId: string | null;
  interactionId: string | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseBody: unknown;
  ip: string;
  createdAt: number;
}

// ------------------------------------------------------------- 实时事件（SSE）

export const STREAM_EVENT_TYPES = [
  'ready',
  'session.created',
  'session.updated',
  'session.deleted',
  'interaction.created',
  'interaction.updated',
  'interaction.event',
  'interaction.completed',
  'ping',
] as const;
export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number];

export interface StreamEvent {
  type: StreamEventType;
  projectId: string;
  sessionId?: string;
  interactionId?: string;
  session?: DebugSession;
  interaction?: Interaction;
  event?: InteractionEvent;
  at: number;
}

export interface ServerInfo {
  name: string;
  version: string;
  startedAt: number;
  databasePath: string;
  baseUrl: string;
  mockBaseUrl: string;
  projectCount: number;
  sessionCount: number;
  interactionCount: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
