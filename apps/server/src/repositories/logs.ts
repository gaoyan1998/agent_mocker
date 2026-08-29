import { and, count, desc, eq, gte, like, lte, type SQL } from 'drizzle-orm';
import type { ApiLog, Paginated } from '@agent-mock/shared';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { apiLogs, type ApiLogRow } from '../db/schema.js';
import { id } from '../lib/id.js';
import { truncate } from '../lib/text.js';

function rowToLog(row: ApiLogRow): ApiLog {
  return {
    id: row.id,
    projectId: row.projectId,
    sessionId: row.sessionId,
    interactionId: row.interactionId,
    method: row.method,
    path: row.path,
    status: row.status,
    durationMs: row.durationMs,
    requestHeaders: row.requestHeaders ?? {},
    requestBody: row.requestBody ?? null,
    responseBody: row.responseBody ?? null,
    ip: row.ip,
    createdAt: row.createdAt,
  };
}

/** body 可能非常大（长 prompt / 长回复），落库前截断，只保留可读片段。 */
function clampBody(body: unknown): unknown {
  if (body == null) return null;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  if (text.length <= config.maxLogBodyChars) return body;
  return { _truncated: true, preview: truncate(text, config.maxLogBodyChars) };
}

export function writeLog(input: {
  projectId?: string | null;
  sessionId?: string | null;
  interactionId?: string | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
  ip?: string;
}): void {
  db.insert(apiLogs)
    .values({
      id: id('log'),
      projectId: input.projectId ?? null,
      sessionId: input.sessionId ?? null,
      interactionId: input.interactionId ?? null,
      method: input.method,
      path: input.path,
      status: input.status,
      durationMs: Math.round(input.durationMs),
      requestHeaders: input.requestHeaders ?? {},
      requestBody: clampBody(input.requestBody),
      responseBody: clampBody(input.responseBody),
      ip: input.ip ?? '',
      createdAt: Date.now(),
    })
    .run();
}

export function listLogs(
  projectId: string,
  options: {
    limit?: number;
    offset?: number;
    sessionId?: string;
    status?: number;
    path?: string;
    from?: number;
    to?: number;
  } = {},
): Paginated<ApiLog> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const filters: SQL[] = [eq(apiLogs.projectId, projectId)];
  if (options.sessionId) filters.push(eq(apiLogs.sessionId, options.sessionId));
  if (options.status) filters.push(eq(apiLogs.status, options.status));
  if (options.path) filters.push(like(apiLogs.path, `%${options.path}%`));
  if (options.from) filters.push(gte(apiLogs.createdAt, options.from));
  if (options.to) filters.push(lte(apiLogs.createdAt, options.to));
  const where = and(...filters);

  const rows = db
    .select()
    .from(apiLogs)
    .where(where)
    .orderBy(desc(apiLogs.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
  const total = Number(db.select({ value: count() }).from(apiLogs).where(where).get()?.value ?? 0);
  return { items: rows.map(rowToLog), total, limit, offset };
}

export function deleteLogsByProject(projectId: string): void {
  db.delete(apiLogs).where(eq(apiLogs.projectId, projectId)).run();
}
