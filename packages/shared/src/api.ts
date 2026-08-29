import { z } from 'zod';
import { FINISH_REASONS } from './openai.js';
import {
  DEFAULT_BEHAVIORS,
  SESSION_STATUSES,
  THINK_MODES,
  TOOL_RESPONSE_MODES,
  mockActionSchema,
  mockToolCallSpecSchema,
  ruleConditionSchema,
} from './mock.js';

/** 管理 API（/api/*）的请求体校验。 */

export const projectSettingsSchema = z.object({
  defaultBehavior: z.enum(DEFAULT_BEHAVIORS),
  fixedReply: z.string(),
  manualTimeoutMs: z.number().int().min(1_000).max(3_600_000),
  responseDelayMs: z.number().int().min(0).max(600_000),
  streamChunkIntervalMs: z.number().int().min(0).max(10_000),
  streamChunkSize: z.number().int().min(1).max(2_000),
  thinkMode: z.enum(THINK_MODES),
  autoSessionIdleMs: z.number().int().min(0).max(86_400_000),
  defaultModel: z.string().min(1),
  upstreamEnabled: z.boolean(),
  upstreamBaseUrl: z.string().url().refine((value) => /^https?:\/\//i.test(value), '仅支持 http(s) URL').or(z.literal('')),
  upstreamApiKey: z.string().max(500),
  upstreamModel: z.string().max(200),
  upstreams: z.array(z.object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(120),
    enabled: z.boolean(),
    baseUrl: z.string().url().refine((value) => /^https?:\/\//i.test(value), '仅支持 http(s) URL'),
    apiKey: z.string().max(500),
    model: z.string().max(200),
  })).max(50),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, '项目名称不能为空').max(120),
  description: z.string().max(2_000).optional(),
  apiKey: z.string().min(8).max(200).optional(),
  settings: projectSettingsSchema.partial().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2_000).optional(),
  apiKey: z.string().min(8).max(200).optional(),
  settings: projectSettingsSchema.partial().optional(),
});

export const createSessionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2_000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  externalId: z.string().min(1).max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
  ruleIds: z.array(z.string()).max(500).optional(),
  scenarioIds: z.array(z.string()).max(500).optional(),
});

export const updateSessionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2_000).optional(),
  status: z.enum(SESSION_STATUSES).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  metadata: z.record(z.unknown()).optional(),
  ruleIds: z.array(z.string()).max(500).optional(),
  scenarioIds: z.array(z.string()).max(500).optional(),
});

export const replaySessionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2_000).optional(),
});

export const createRuleSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(-999).max(999).optional(),
  condition: ruleConditionSchema,
  action: mockActionSchema,
});

export const updateRuleSchema = createRuleSchema.partial();

export const scenarioStepInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(120).optional(),
  condition: ruleConditionSchema.nullable().optional(),
  action: mockActionSchema,
});

export const createScenarioSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).optional(),
  enabled: z.boolean().optional(),
  trigger: ruleConditionSchema.nullable().optional(),
  loop: z.boolean().optional(),
  steps: z.array(scenarioStepInputSchema).max(200).optional(),
});

export const updateScenarioSchema = createScenarioSchema.partial();

export const createToolSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Tool 名称只能包含字母、数字、_ . -'),
  description: z.string().max(2_000).optional(),
  parameters: z.record(z.unknown()).optional(),
  responseMode: z.enum(TOOL_RESPONSE_MODES).optional(),
  response: z.unknown().optional(),
  responses: z.array(z.unknown()).max(100).optional(),
  errorMessage: z.string().max(1_000).optional(),
  delayMs: z.number().int().min(0).max(600_000).optional(),
});

export const updateToolSchema = createToolSchema.partial();

/** 从一次请求同步 Tool 定义；服务端按项目 + 名称幂等去重。 */
export const syncToolsSchema = z.object({
  tools: z.array(
    createToolSchema.pick({ name: true, description: true, parameters: true }),
  ).max(200),
});

// ----------------------------------------------------- 人工控制

export const replyActionSchema = z.object({
  content: z.string(),
  finishReason: z.enum(FINISH_REASONS).optional(),
  delayMs: z.number().int().min(0).max(600_000).optional(),
});

export const thinkActionSchema = z.object({
  content: z.string().min(1),
});

export const toolCallActionSchema = z.object({
  toolCalls: z.array(mockToolCallSpecSchema).min(1).optional(),
  /** 单个 Tool Call 的便捷写法。 */
  name: z.string().min(1).optional(),
  arguments: z.union([z.string(), z.record(z.unknown())]).optional(),
  content: z.string().optional(),
  delayMs: z.number().int().min(0).max(600_000).optional(),
});

export const toolResultActionSchema = z.object({
  tool: z.string().min(1),
  result: z.unknown().optional(),
  toolCallId: z.string().optional(),
  /** 不传 result 时，从 Tool 配置里解析 mock 响应。 */
  useToolConfig: z.boolean().optional(),
});

export const errorActionSchema = z.object({
  status: z.number().int().min(400).max(599),
  message: z.string().min(1),
  errorType: z.string().optional(),
  code: z.string().nullable().optional(),
});

export const genericActionSchema = z.object({
  action: mockActionSchema,
});

export const upstreamActionSchema = z.object({
  upstreamId: z.string().max(100).optional(),
  model: z.string().max(200).optional(),
});

export const upstreamConnectionSchema = z.object({
  baseUrl: z.string().url().refine((value) => /^https?:\/\//i.test(value), '仅支持 http(s) URL'),
  apiKey: z.string().max(500),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
export type CreateScenarioInput = z.infer<typeof createScenarioSchema>;
export type UpdateScenarioInput = z.infer<typeof updateScenarioSchema>;
export type ScenarioStepInput = z.infer<typeof scenarioStepInputSchema>;
export type CreateToolInput = z.infer<typeof createToolSchema>;
export type UpdateToolInput = z.infer<typeof updateToolSchema>;
export type SyncToolsInput = z.infer<typeof syncToolsSchema>;
export type ReplyActionInput = z.infer<typeof replyActionSchema>;
export type ThinkActionInput = z.infer<typeof thinkActionSchema>;
export type ToolCallActionInput = z.infer<typeof toolCallActionSchema>;
export type ToolResultActionInput = z.infer<typeof toolResultActionSchema>;
export type ErrorActionInput = z.infer<typeof errorActionSchema>;
export type UpstreamActionInput = z.infer<typeof upstreamActionSchema>;
export type UpstreamConnectionInput = z.infer<typeof upstreamConnectionSchema>;
