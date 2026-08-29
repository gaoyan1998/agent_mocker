import { and, asc, count, desc, eq, inArray, max } from 'drizzle-orm';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  Interaction,
  InteractionEvent,
  InteractionEventType,
  InteractionMode,
  InteractionStatus,
  MockErrorSpec,
  Paginated,
} from '@agent-mock/shared';
import { db } from '../db/index.js';
import {
  interactionEvents,
  interactions,
  type InteractionEventRow,
  type InteractionRow,
} from '../db/schema.js';
import { id } from '../lib/id.js';

export function rowToInteraction(row: InteractionRow, events?: InteractionEvent[]): Interaction {
  return {
    id: row.id,
    projectId: row.projectId,
    sessionId: row.sessionId,
    sequence: row.sequence,
    status: row.status,
    mode: row.mode,
    stream: row.stream,
    model: row.model,
    request: row.request,
    requestHeaders: row.requestHeaders ?? {},
    response: row.response ?? null,
    error: row.error ?? null,
    ruleId: row.ruleId,
    scenarioId: row.scenarioId,
    latencyMs: row.latencyMs,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    ...(events ? { events } : {}),
  };
}

export function rowToEvent(row: InteractionEventRow): InteractionEvent {
  return {
    id: row.id,
    interactionId: row.interactionId,
    sequence: row.sequence,
    type: row.type,
    payload: row.payload ?? {},
    createdAt: row.createdAt,
  };
}

export function nextInteractionSequence(sessionId: string): number {
  const row = db
    .select({ value: max(interactions.sequence) })
    .from(interactions)
    .where(eq(interactions.sessionId, sessionId))
    .get();
  return Number(row?.value ?? 0) + 1;
}

export function createInteraction(input: {
  projectId: string;
  sessionId: string;
  sequence: number;
  status: InteractionStatus;
  mode: InteractionMode;
  stream: boolean;
  model: string;
  request: ChatCompletionRequest;
  requestHeaders: Record<string, string>;
}): Interaction {
  const row: InteractionRow = {
    id: id('int'),
    projectId: input.projectId,
    sessionId: input.sessionId,
    sequence: input.sequence,
    status: input.status,
    mode: input.mode,
    stream: input.stream,
    model: input.model,
    request: input.request,
    requestHeaders: input.requestHeaders,
    response: null,
    error: null,
    ruleId: null,
    scenarioId: null,
    latencyMs: null,
    createdAt: Date.now(),
    completedAt: null,
  };
  db.insert(interactions).values(row).run();
  return rowToInteraction(row, []);
}

export function updateInteraction(
  interactionId: string,
  patch: {
    status?: InteractionStatus;
    mode?: InteractionMode;
    response?: ChatCompletionResponse | null;
    error?: MockErrorSpec | null;
    ruleId?: string | null;
    scenarioId?: string | null;
    latencyMs?: number | null;
    completedAt?: number | null;
  },
): Interaction | null {
  db.update(interactions).set(patch).where(eq(interactions.id, interactionId)).run();
  return findInteraction(interactionId);
}

export function findInteraction(interactionId: string, withEvents = true): Interaction | null {
  const row = db.select().from(interactions).where(eq(interactions.id, interactionId)).get();
  if (!row) return null;
  return rowToInteraction(row, withEvents ? listEvents(interactionId) : undefined);
}

export function findInteractionRow(interactionId: string): InteractionRow | null {
  return db.select().from(interactions).where(eq(interactions.id, interactionId)).get() ?? null;
}

export function findInteractionBySequence(
  sessionId: string,
  sequence: number,
): InteractionRow | null {
  return (
    db
      .select()
      .from(interactions)
      .where(and(eq(interactions.sessionId, sessionId), eq(interactions.sequence, sequence)))
      .get() ?? null
  );
}

/** Session 中的上一次 Interaction，用于计算 messages 增量（新出现的 tool 结果）。 */
export function findPreviousInteraction(
  sessionId: string,
  sequence: number,
): InteractionRow | null {
  const rows = db
    .select()
    .from(interactions)
    .where(eq(interactions.sessionId, sessionId))
    .orderBy(desc(interactions.sequence))
    .limit(5)
    .all();
  return rows.find((row) => row.sequence < sequence) ?? null;
}

export function listInteractions(
  sessionId: string,
  options: { limit?: number; offset?: number; withEvents?: boolean } = {},
): Paginated<Interaction> {
  const limit = options.limit ?? 200;
  const offset = options.offset ?? 0;
  const rows = db
    .select()
    .from(interactions)
    .where(eq(interactions.sessionId, sessionId))
    .orderBy(asc(interactions.sequence))
    .limit(limit)
    .offset(offset)
    .all();
  const total = Number(
    db
      .select({ value: count() })
      .from(interactions)
      .where(eq(interactions.sessionId, sessionId))
      .get()?.value ?? 0,
  );

  let eventsByInteraction = new Map<string, InteractionEvent[]>();
  if (options.withEvents !== false && rows.length > 0) {
    eventsByInteraction = listEventsForInteractions(rows.map((row) => row.id));
  }

  return {
    items: rows.map((row) => rowToInteraction(row, eventsByInteraction.get(row.id) ?? [])),
    total,
    limit,
    offset,
  };
}

export function listWaitingInteractions(projectId: string): Interaction[] {
  return db
    .select()
    .from(interactions)
    .where(and(eq(interactions.projectId, projectId), eq(interactions.status, 'waiting')))
    .orderBy(asc(interactions.createdAt))
    .all()
    .map((row) => rowToInteraction(row, listEvents(row.id)));
}

export function countInteractions(): number {
  return Number(db.select({ value: count() }).from(interactions).get()?.value ?? 0);
}

// ------------------------------------------------------------------- Events

export function appendEvent(
  interactionId: string,
  type: InteractionEventType,
  payload: Record<string, unknown>,
): InteractionEvent {
  const sequenceRow = db
    .select({ value: max(interactionEvents.sequence) })
    .from(interactionEvents)
    .where(eq(interactionEvents.interactionId, interactionId))
    .get();
  const row: InteractionEventRow = {
    id: id('evt'),
    interactionId,
    sequence: Number(sequenceRow?.value ?? 0) + 1,
    type,
    payload,
    createdAt: Date.now(),
  };
  db.insert(interactionEvents).values(row).run();
  return rowToEvent(row);
}

export function listEvents(interactionId: string): InteractionEvent[] {
  return db
    .select()
    .from(interactionEvents)
    .where(eq(interactionEvents.interactionId, interactionId))
    .orderBy(asc(interactionEvents.sequence))
    .all()
    .map(rowToEvent);
}

export function listEventsForInteractions(
  interactionIds: string[],
): Map<string, InteractionEvent[]> {
  const map = new Map<string, InteractionEvent[]>();
  if (interactionIds.length === 0) return map;
  for (const row of db
    .select()
    .from(interactionEvents)
    .where(inArray(interactionEvents.interactionId, interactionIds))
    .orderBy(asc(interactionEvents.sequence))
    .all()) {
    const list = map.get(row.interactionId) ?? [];
    list.push(rowToEvent(row));
    map.set(row.interactionId, list);
  }
  return map;
}

/** 服务重启时，把还挂在 waiting/pending 的 Interaction 标记为 aborted —— 它们的 HTTP 连接早就断了。 */
export function abortDanglingInteractions(): number {
  const now = Date.now();
  const result = db
    .update(interactions)
    .set({ status: 'aborted', completedAt: now })
    .where(inArray(interactions.status, ['waiting', 'pending']))
    .run();
  return result.changes;
}
