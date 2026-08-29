import { and, asc, count, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { DebugSession, Paginated, SessionStatus } from '@agent-mock/shared';
import { db, sqlite } from '../db/index.js';
import {
  apiLogs,
  debugSessions,
  interactionEvents,
  interactions,
  scenarioRuns,
  type SessionRow,
} from '../db/schema.js';
import { id } from '../lib/id.js';
import { pendingRegistry } from '../engine/pending-registry.js';

export function rowToSession(row: SessionRow, waitingCount?: number): DebugSession {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    status: row.status,
    tags: row.tags ?? [],
    externalId: row.externalId,
    auto: row.auto,
    replaySourceId: row.replaySourceId,
    metadata: row.metadata ?? {},
    ruleIds: row.ruleIds ?? [],
    scenarioIds: row.scenarioIds ?? [],
    interactionCount: row.interactionCount,
    waitingCount,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    lastActivityAt: row.lastActivityAt,
  };
}

function waitingCounts(sessionIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  if (sessionIds.length === 0) return map;
  for (const row of db
    .select({ sessionId: interactions.sessionId, value: count() })
    .from(interactions)
    .where(and(inArray(interactions.sessionId, sessionIds), eq(interactions.status, 'waiting')))
    .groupBy(interactions.sessionId)
    .all()) {
    map.set(row.sessionId, Number(row.value));
  }
  return map;
}

export function listSessions(
  projectId: string,
  options: { limit?: number; offset?: number; status?: SessionStatus } = {},
): Paginated<DebugSession> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const where = options.status
    ? and(eq(debugSessions.projectId, projectId), eq(debugSessions.status, options.status))
    : eq(debugSessions.projectId, projectId);

  const rows = db
    .select()
    .from(debugSessions)
    .where(where)
    .orderBy(desc(debugSessions.lastActivityAt))
    .limit(limit)
    .offset(offset)
    .all();
  const total = Number(db.select({ value: count() }).from(debugSessions).where(where).get()?.value ?? 0);
  const waiting = waitingCounts(rows.map((row) => row.id));

  return {
    items: rows.map((row) => rowToSession(row, waiting.get(row.id) ?? 0)),
    total,
    limit,
    offset,
  };
}

export function findSession(sessionId: string): DebugSession | null {
  const row = db.select().from(debugSessions).where(eq(debugSessions.id, sessionId)).get();
  if (!row) return null;
  return rowToSession(row, waitingCounts([sessionId]).get(sessionId) ?? 0);
}

export function findSessionRow(sessionId: string): SessionRow | null {
  return db.select().from(debugSessions).where(eq(debugSessions.id, sessionId)).get() ?? null;
}

export function findSessionByExternalId(projectId: string, externalId: string): SessionRow | null {
  return (
    db
      .select()
      .from(debugSessions)
      .where(and(eq(debugSessions.projectId, projectId), eq(debugSessions.externalId, externalId)))
      .get() ?? null
  );
}

/**
 * Agent 的 URL 没有携带会话 ID 时复用的自动 Session：
 * 同项目下最近活跃、且未超过空闲窗口的 active 自动会话。
 */
export function findReusableAutoSession(projectId: string, idleMs: number): SessionRow | null {
  const conditions = [
    eq(debugSessions.projectId, projectId),
    eq(debugSessions.status, 'active'),
    eq(debugSessions.auto, true),
    isNull(debugSessions.replaySourceId),
  ];
  if (idleMs > 0) {
    conditions.push(lt(sql`${Date.now()} - ${debugSessions.lastActivityAt}`, idleMs));
  }
  return (
    db
      .select()
      .from(debugSessions)
      .where(and(...conditions))
      .orderBy(desc(debugSessions.lastActivityAt))
      .get() ?? null
  );
}

export function createSession(input: {
  projectId: string;
  name?: string;
  description?: string;
  tags?: string[];
  externalId?: string | null;
  auto?: boolean;
  replaySourceId?: string | null;
  metadata?: Record<string, unknown>;
  ruleIds?: string[];
  scenarioIds?: string[];
}): DebugSession {
  const now = Date.now();
  const row: SessionRow = {
    id: id('sess'),
    projectId: input.projectId,
    name: input.name?.trim() || defaultSessionName(now),
    description: input.description ?? '',
    status: 'active',
    tags: input.tags ?? [],
    externalId: input.externalId ?? null,
    auto: input.auto ?? false,
    replaySourceId: input.replaySourceId ?? null,
    metadata: input.metadata ?? {},
    ruleIds: input.ruleIds ?? [],
    scenarioIds: input.scenarioIds ?? [],
    interactionCount: 0,
    startedAt: now,
    endedAt: null,
    lastActivityAt: now,
  };
  db.insert(debugSessions).values(row).run();
  return rowToSession(row, 0);
}

function defaultSessionName(now: number): string {
  const date = new Date(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `会话 ${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
}

export function updateSession(
  sessionId: string,
  input: {
    name?: string;
    description?: string;
    status?: SessionStatus;
    tags?: string[];
    metadata?: Record<string, unknown>;
    ruleIds?: string[];
    scenarioIds?: string[];
  },
): DebugSession | null {
  const existing = findSessionRow(sessionId);
  if (!existing) return null;

  const patch: Partial<SessionRow> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.metadata !== undefined) patch.metadata = input.metadata;
  if (input.ruleIds !== undefined) patch.ruleIds = input.ruleIds;
  if (input.scenarioIds !== undefined) patch.scenarioIds = input.scenarioIds;
  if (input.status !== undefined) {
    patch.status = input.status;
    patch.endedAt = input.status === 'active' ? null : (existing.endedAt ?? Date.now());
  }
  db.update(debugSessions).set(patch).where(eq(debugSessions.id, sessionId)).run();
  return findSession(sessionId);
}

/** 有新 Interaction 时刷新会话活跃时间与计数。 */
export function bumpSession(sessionId: string, interactionCount: number): void {
  db.update(debugSessions)
    .set({ lastActivityAt: Date.now(), interactionCount })
    .where(eq(debugSessions.id, sessionId))
    .run();
}

export function touchSession(sessionId: string): void {
  db.update(debugSessions)
    .set({ lastActivityAt: Date.now() })
    .where(eq(debugSessions.id, sessionId))
    .run();
}

const deleteEventsBySession = sqlite.prepare(
  `DELETE FROM interaction_events WHERE interaction_id IN (SELECT id FROM interactions WHERE session_id = ?)`,
);

/** 清空会话的录制数据，但保留会话本身、外部 ID 和回放源绑定。 */
export function resetSession(sessionId: string): DebugSession | null {
  const existing = findSessionRow(sessionId);
  if (!existing) return null;
  pendingRegistry.abortSession(sessionId);
  deleteEventsBySession.run(sessionId);
  db.delete(interactions).where(eq(interactions.sessionId, sessionId)).run();
  db.delete(scenarioRuns).where(eq(scenarioRuns.sessionId, sessionId)).run();
  db.update(apiLogs).set({ sessionId: null }).where(eq(apiLogs.sessionId, sessionId)).run();
  const now = Date.now();
  db.update(debugSessions)
    .set({ interactionCount: 0, status: 'active', endedAt: null, lastActivityAt: now })
    .where(eq(debugSessions.id, sessionId))
    .run();
  return findSession(sessionId);
}

export function deleteSession(sessionId: string): boolean {
  const existing = findSessionRow(sessionId);
  if (!existing) return false;
  deleteEventsBySession.run(sessionId);
  db.delete(interactions).where(eq(interactions.sessionId, sessionId)).run();
  db.delete(scenarioRuns).where(eq(scenarioRuns.sessionId, sessionId)).run();
  db.update(apiLogs).set({ sessionId: null }).where(eq(apiLogs.sessionId, sessionId)).run();
  db.delete(debugSessions).where(eq(debugSessions.id, sessionId)).run();
  return true;
}

export function deleteSessionsByProject(projectId: string): void {
  const rows = db
    .select({ id: debugSessions.id })
    .from(debugSessions)
    .where(eq(debugSessions.projectId, projectId))
    .all();
  for (const row of rows) {
    deleteEventsBySession.run(row.id);
  }
  if (rows.length > 0) {
    db.delete(scenarioRuns)
      .where(inArray(scenarioRuns.sessionId, rows.map((row) => row.id)))
      .run();
  }
  db.delete(interactions).where(eq(interactions.projectId, projectId)).run();
  db.delete(debugSessions).where(eq(debugSessions.projectId, projectId)).run();
}

export function countSessions(): number {
  return Number(db.select({ value: count() }).from(debugSessions).get()?.value ?? 0);
}

export function listSessionIdsByProject(projectId: string): string[] {
  return db
    .select({ id: debugSessions.id })
    .from(debugSessions)
    .where(eq(debugSessions.projectId, projectId))
    .orderBy(asc(debugSessions.startedAt))
    .all()
    .map((row) => row.id);
}
