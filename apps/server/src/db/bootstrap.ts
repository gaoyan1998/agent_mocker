import type Database from 'better-sqlite3';

/**
 * 建表 SQL。用 `IF NOT EXISTS` 直接在启动时执行，省掉 migration 工具链 ——
 * 这是一个本地开发用的 Mock Server，数据库随时可删。
 * 修改这里时记得同步 ./schema.ts。
 */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL,
    settings TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS projects_api_key_idx ON projects (api_key)`,

  `CREATE TABLE IF NOT EXISTS debug_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    tags TEXT NOT NULL DEFAULT '[]',
    external_id TEXT,
    auto INTEGER NOT NULL DEFAULT 0,
    replay_source_id TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    rule_ids TEXT NOT NULL DEFAULT '[]',
    scenario_ids TEXT NOT NULL DEFAULT '[]',
    interaction_count INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    last_activity_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS debug_sessions_project_idx ON debug_sessions (project_id, last_activity_at)`,
  `CREATE INDEX IF NOT EXISTS debug_sessions_external_idx ON debug_sessions (project_id, external_id)`,

  `CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    status TEXT NOT NULL,
    mode TEXT NOT NULL,
    stream INTEGER NOT NULL DEFAULT 0,
    model TEXT NOT NULL,
    request TEXT NOT NULL,
    request_headers TEXT NOT NULL DEFAULT '{}',
    response TEXT,
    error TEXT,
    rule_id TEXT,
    scenario_id TEXT,
    latency_ms INTEGER,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS interactions_session_idx ON interactions (session_id, sequence)`,
  `CREATE INDEX IF NOT EXISTS interactions_project_idx ON interactions (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS interactions_status_idx ON interactions (status)`,

  `CREATE TABLE IF NOT EXISTS interaction_events (
    id TEXT PRIMARY KEY,
    interaction_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS interaction_events_interaction_idx ON interaction_events (interaction_id, sequence)`,

  `CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 100,
    "condition" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    match_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS rules_project_idx ON rules (project_id, priority)`,

  `CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    "trigger" TEXT,
    "loop" INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS scenarios_project_idx ON scenarios (project_id)`,

  `CREATE TABLE IF NOT EXISTS scenario_steps (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    "condition" TEXT,
    "action" TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS scenario_steps_scenario_idx ON scenario_steps (scenario_id, sequence)`,

  `CREATE TABLE IF NOT EXISTS scenario_runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    cursor INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scenario_runs_unique_idx ON scenario_runs (session_id, scenario_id)`,

  `CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    parameters TEXT NOT NULL DEFAULT '{}',
    response_mode TEXT NOT NULL DEFAULT 'static',
    response TEXT,
    responses TEXT NOT NULL DEFAULT '[]',
    error_message TEXT NOT NULL DEFAULT '',
    delay_ms INTEGER NOT NULL DEFAULT 0,
    cursor INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tools_project_name_idx ON tools (project_id, name)`,

  `CREATE TABLE IF NOT EXISTS api_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    session_id TEXT,
    interaction_id TEXT,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    request_headers TEXT NOT NULL DEFAULT '{}',
    request_body TEXT,
    response_body TEXT,
    ip TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS api_logs_project_idx ON api_logs (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS api_logs_session_idx ON api_logs (session_id)`,
];

export function bootstrapSchema(sqlite: Database.Database): void {
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  for (const statement of STATEMENTS) {
    sqlite.exec(statement);
  }
  for (const statement of [
    `ALTER TABLE debug_sessions ADD COLUMN rule_ids TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE debug_sessions ADD COLUMN scenario_ids TEXT NOT NULL DEFAULT '[]'`,
  ]) {
    try { sqlite.exec(statement); } catch { /* columns already exist */ }
  }
}
