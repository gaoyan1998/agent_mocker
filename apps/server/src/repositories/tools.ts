import { and, asc, eq, sql } from 'drizzle-orm';
import type { MockTool, ToolResponseMode } from '@agent-mock/shared';
import { db } from '../db/index.js';
import { tools, type ToolRow } from '../db/schema.js';
import { id } from '../lib/id.js';

export function rowToTool(row: ToolRow): MockTool {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    parameters: row.parameters ?? {},
    responseMode: row.responseMode,
    response: row.response ?? null,
    responses: row.responses ?? [],
    errorMessage: row.errorMessage,
    delayMs: row.delayMs,
    cursor: row.cursor,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listTools(projectId: string): MockTool[] {
  return db
    .select()
    .from(tools)
    .where(eq(tools.projectId, projectId))
    .orderBy(asc(tools.name))
    .all()
    .map(rowToTool);
}

export function findTool(toolId: string): MockTool | null {
  const row = db.select().from(tools).where(eq(tools.id, toolId)).get();
  return row ? rowToTool(row) : null;
}

export function findToolByName(projectId: string, name: string): MockTool | null {
  const row = db
    .select()
    .from(tools)
    .where(and(eq(tools.projectId, projectId), eq(tools.name, name)))
    .get();
  return row ? rowToTool(row) : null;
}

export function createTool(input: {
  projectId: string;
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  responseMode?: ToolResponseMode;
  response?: unknown;
  responses?: unknown[];
  errorMessage?: string;
  delayMs?: number;
}): MockTool {
  const now = Date.now();
  const row: ToolRow = {
    id: id('tool'),
    projectId: input.projectId,
    name: input.name,
    description: input.description ?? '',
    parameters: input.parameters ?? {},
    responseMode: input.responseMode ?? 'static',
    response: input.response ?? null,
    responses: input.responses ?? [],
    errorMessage: input.errorMessage ?? '',
    delayMs: input.delayMs ?? 0,
    cursor: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(tools).values(row).run();
  return rowToTool(row);
}

/** 幂等同步请求中的 Tool 定义，只更新声明元数据，不触碰 mock 响应配置。 */
export function syncTools(
  projectId: string,
  inputs: Array<{ name: string; description?: string; parameters?: Record<string, unknown> }>,
): { items: MockTool[]; created: number; updated: number } {
  const unique = new Map(inputs.map((input) => [input.name, input]));
  let created = 0;
  let updated = 0;
  for (const input of unique.values()) {
    const existing = findToolByName(projectId, input.name);
    if (!existing) {
      createTool({ projectId, ...input });
      created += 1;
      continue;
    }
    const changed =
      existing.description !== (input.description ?? '') ||
      JSON.stringify(existing.parameters) !== JSON.stringify(input.parameters ?? {});
    if (changed) {
      updateTool(existing.id, {
        description: input.description ?? '',
        parameters: input.parameters ?? {},
      });
      updated += 1;
    }
  }
  return { items: listTools(projectId), created, updated };
}

export function updateTool(
  toolId: string,
  input: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
    responseMode?: ToolResponseMode;
    response?: unknown;
    responses?: unknown[];
    errorMessage?: string;
    delayMs?: number;
  },
): MockTool | null {
  if (!findTool(toolId)) return null;
  const patch: Partial<ToolRow> = { updatedAt: Date.now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.parameters !== undefined) patch.parameters = input.parameters;
  if (input.responseMode !== undefined) patch.responseMode = input.responseMode;
  if (input.response !== undefined) patch.response = input.response;
  if (input.responses !== undefined) patch.responses = input.responses;
  if (input.errorMessage !== undefined) patch.errorMessage = input.errorMessage;
  if (input.delayMs !== undefined) patch.delayMs = input.delayMs;
  db.update(tools).set(patch).where(eq(tools.id, toolId)).run();
  return findTool(toolId);
}

export function deleteTool(toolId: string): boolean {
  return db.delete(tools).where(eq(tools.id, toolId)).run().changes > 0;
}

export function deleteToolsByProject(projectId: string): void {
  db.delete(tools).where(eq(tools.projectId, projectId)).run();
}

/** sequence 模式：取完一个值后游标前进。 */
export function advanceToolCursor(toolId: string): void {
  db.update(tools)
    .set({ cursor: sql`${tools.cursor} + 1` })
    .where(eq(tools.id, toolId))
    .run();
}

export function resetToolCursor(toolId: string): void {
  db.update(tools).set({ cursor: 0 }).where(eq(tools.id, toolId)).run();
}
