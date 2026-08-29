import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  DefaultBehavior,
  InteractionEventType,
  InteractionMode,
  InteractionStatus,
  MockAction,
  MockErrorSpec,
  ProjectSettings,
  RuleCondition,
  SessionStatus,
  ToolResponseMode,
} from '@agent-mock/shared';

/**
 * SQLite 表定义。
 * 时间统一存 epoch 毫秒（integer），JSON 字段用 text + mode:'json'。
 * 建表 SQL 见 ./bootstrap.ts —— 两处必须保持一致。
 */

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    apiKey: text('api_key').notNull(),
    settings: text('settings', { mode: 'json' }).$type<ProjectSettings>().notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('projects_api_key_idx').on(table.apiKey)],
);

export const debugSessions = sqliteTable(
  'debug_sessions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').$type<SessionStatus>().notNull().default('active'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
    externalId: text('external_id'),
    auto: integer('auto', { mode: 'boolean' }).notNull().default(false),
    replaySourceId: text('replay_source_id'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    ruleIds: text('rule_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
    scenarioIds: text('scenario_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
    interactionCount: integer('interaction_count').notNull().default(0),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    lastActivityAt: integer('last_activity_at').notNull(),
  },
  (table) => [
    index('debug_sessions_project_idx').on(table.projectId, table.lastActivityAt),
    index('debug_sessions_external_idx').on(table.projectId, table.externalId),
  ],
);

export const interactions = sqliteTable(
  'interactions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    sessionId: text('session_id').notNull(),
    sequence: integer('sequence').notNull(),
    status: text('status').$type<InteractionStatus>().notNull(),
    mode: text('mode').$type<InteractionMode>().notNull(),
    stream: integer('stream', { mode: 'boolean' }).notNull().default(false),
    model: text('model').notNull(),
    request: text('request', { mode: 'json' }).$type<ChatCompletionRequest>().notNull(),
    requestHeaders: text('request_headers', { mode: 'json' })
      .$type<Record<string, string>>()
      .notNull(),
    response: text('response', { mode: 'json' }).$type<ChatCompletionResponse | null>(),
    error: text('error', { mode: 'json' }).$type<MockErrorSpec | null>(),
    ruleId: text('rule_id'),
    scenarioId: text('scenario_id'),
    latencyMs: integer('latency_ms'),
    createdAt: integer('created_at').notNull(),
    completedAt: integer('completed_at'),
  },
  (table) => [
    index('interactions_session_idx').on(table.sessionId, table.sequence),
    index('interactions_project_idx').on(table.projectId, table.createdAt),
    index('interactions_status_idx').on(table.status),
  ],
);

export const interactionEvents = sqliteTable(
  'interaction_events',
  {
    id: text('id').primaryKey(),
    interactionId: text('interaction_id').notNull(),
    sequence: integer('sequence').notNull(),
    type: text('type').$type<InteractionEventType>().notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('interaction_events_interaction_idx').on(table.interactionId, table.sequence)],
);

export const rules = sqliteTable(
  'rules',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    priority: integer('priority').notNull().default(100),
    condition: text('condition', { mode: 'json' }).$type<RuleCondition>().notNull(),
    action: text('action', { mode: 'json' }).$type<MockAction>().notNull(),
    matchCount: integer('match_count').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('rules_project_idx').on(table.projectId, table.priority)],
);

export const scenarios = sqliteTable(
  'scenarios',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    trigger: text('trigger', { mode: 'json' }).$type<RuleCondition | null>(),
    loop: integer('loop', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('scenarios_project_idx').on(table.projectId)],
);

export const scenarioSteps = sqliteTable(
  'scenario_steps',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id').notNull(),
    sequence: integer('sequence').notNull(),
    name: text('name').notNull().default(''),
    condition: text('condition', { mode: 'json' }).$type<RuleCondition | null>(),
    action: text('action', { mode: 'json' }).$type<MockAction>().notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('scenario_steps_scenario_idx').on(table.scenarioId, table.sequence)],
);

/** Scenario 在某个 Session 上的执行游标（走到第几步）。 */
export const scenarioRuns = sqliteTable(
  'scenario_runs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    scenarioId: text('scenario_id').notNull(),
    cursor: integer('cursor').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('scenario_runs_unique_idx').on(table.sessionId, table.scenarioId)],
);

export const tools = sqliteTable(
  'tools',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    parameters: text('parameters', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    responseMode: text('response_mode').$type<ToolResponseMode>().notNull().default('static'),
    response: text('response', { mode: 'json' }).$type<unknown>(),
    responses: text('responses', { mode: 'json' }).$type<unknown[]>().notNull(),
    errorMessage: text('error_message').notNull().default(''),
    delayMs: integer('delay_ms').notNull().default(0),
    cursor: integer('cursor').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('tools_project_name_idx').on(table.projectId, table.name)],
);

export const apiLogs = sqliteTable(
  'api_logs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id'),
    sessionId: text('session_id'),
    interactionId: text('interaction_id'),
    method: text('method').notNull(),
    path: text('path').notNull(),
    status: integer('status').notNull(),
    durationMs: integer('duration_ms').notNull(),
    requestHeaders: text('request_headers', { mode: 'json' })
      .$type<Record<string, string>>()
      .notNull(),
    requestBody: text('request_body', { mode: 'json' }).$type<unknown>(),
    responseBody: text('response_body', { mode: 'json' }).$type<unknown>(),
    ip: text('ip').notNull().default(''),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('api_logs_project_idx').on(table.projectId, table.createdAt),
    index('api_logs_session_idx').on(table.sessionId),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
export type SessionRow = typeof debugSessions.$inferSelect;
export type InteractionRow = typeof interactions.$inferSelect;
export type InteractionEventRow = typeof interactionEvents.$inferSelect;
export type RuleRow = typeof rules.$inferSelect;
export type ScenarioRow = typeof scenarios.$inferSelect;
export type ScenarioStepRow = typeof scenarioSteps.$inferSelect;
export type ToolRow = typeof tools.$inferSelect;
export type ApiLogRow = typeof apiLogs.$inferSelect;

export const DEFAULT_TOOL_RESPONSE: ToolResponseMode = 'static';
