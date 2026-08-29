import { and, count, desc, eq } from 'drizzle-orm';
import {
  DEFAULT_PROJECT_SETTINGS,
  type Project,
  type ProjectSettings,
} from '@agent-mock/shared';
import { db } from '../db/index.js';
import { debugSessions, interactions, projects, type ProjectRow } from '../db/schema.js';
import { id, newApiKey } from '../lib/id.js';

export function rowToProject(
  row: ProjectRow,
  stats?: { sessionCount?: number; interactionCount?: number; waitingCount?: number },
): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    apiKey: row.apiKey,
    // 合并默认值：老数据缺少新增字段时也能正常工作。
    settings: { ...DEFAULT_PROJECT_SETTINGS, ...(row.settings ?? {}) },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...stats,
  };
}

function statsByProject(): Map<string, { sessionCount: number; interactionCount: number; waitingCount: number }> {
  const map = new Map<string, { sessionCount: number; interactionCount: number; waitingCount: number }>();
  const ensure = (projectId: string) => {
    let entry = map.get(projectId);
    if (!entry) {
      entry = { sessionCount: 0, interactionCount: 0, waitingCount: 0 };
      map.set(projectId, entry);
    }
    return entry;
  };

  for (const row of db
    .select({ projectId: debugSessions.projectId, value: count() })
    .from(debugSessions)
    .groupBy(debugSessions.projectId)
    .all()) {
    ensure(row.projectId).sessionCount = Number(row.value);
  }
  for (const row of db
    .select({ projectId: interactions.projectId, value: count() })
    .from(interactions)
    .groupBy(interactions.projectId)
    .all()) {
    ensure(row.projectId).interactionCount = Number(row.value);
  }
  for (const row of db
    .select({ projectId: interactions.projectId, value: count() })
    .from(interactions)
    .where(eq(interactions.status, 'waiting'))
    .groupBy(interactions.projectId)
    .all()) {
    ensure(row.projectId).waitingCount = Number(row.value);
  }
  return map;
}

export function listProjects(): Project[] {
  const stats = statsByProject();
  return db
    .select()
    .from(projects)
    .orderBy(desc(projects.updatedAt))
    .all()
    .map((row) =>
      rowToProject(row, stats.get(row.id) ?? { sessionCount: 0, interactionCount: 0, waitingCount: 0 }),
    );
}

export function findProject(projectId: string): Project | null {
  const row = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!row) return null;
  const stats = statsByProject().get(projectId);
  return rowToProject(row, stats ?? { sessionCount: 0, interactionCount: 0, waitingCount: 0 });
}

export function findProjectByApiKey(apiKey: string): Project | null {
  const row = db.select().from(projects).where(eq(projects.apiKey, apiKey)).get();
  return row ? rowToProject(row) : null;
}

export function countProjects(): number {
  const row = db.select({ value: count() }).from(projects).get();
  return Number(row?.value ?? 0);
}

/** strictApiKey=false 时的兜底：只有一个项目就直接用它。 */
export function findSoleProject(): Project | null {
  const rows = db.select().from(projects).limit(2).all();
  return rows.length === 1 ? rowToProject(rows[0]!) : null;
}

export function createProject(input: {
  name: string;
  description?: string;
  apiKey?: string;
  settings?: Partial<ProjectSettings>;
}): Project {
  const now = Date.now();
  const row: ProjectRow = {
    id: id('proj'),
    name: input.name,
    description: input.description ?? '',
    apiKey: input.apiKey?.trim() || newApiKey(),
    settings: { ...DEFAULT_PROJECT_SETTINGS, ...(input.settings ?? {}) },
    createdAt: now,
    updatedAt: now,
  };
  db.insert(projects).values(row).run();
  return rowToProject(row, { sessionCount: 0, interactionCount: 0, waitingCount: 0 });
}

export function updateProject(
  projectId: string,
  input: {
    name?: string;
    description?: string;
    apiKey?: string;
    settings?: Partial<ProjectSettings>;
  },
): Project | null {
  const existing = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!existing) return null;

  const patch: Partial<ProjectRow> = { updatedAt: Date.now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.apiKey !== undefined && input.apiKey.trim()) patch.apiKey = input.apiKey.trim();
  if (input.settings !== undefined) {
    patch.settings = {
      ...DEFAULT_PROJECT_SETTINGS,
      ...(existing.settings ?? {}),
      ...input.settings,
    };
  }
  db.update(projects).set(patch).where(eq(projects.id, projectId)).run();
  return findProject(projectId);
}

export function deleteProject(projectId: string): boolean {
  const result = db.delete(projects).where(eq(projects.id, projectId)).run();
  return result.changes > 0;
}

export function projectWaitingCount(projectId: string): number {
  const row = db
    .select({ value: count() })
    .from(interactions)
    .where(and(eq(interactions.projectId, projectId), eq(interactions.status, 'waiting')))
    .get();
  return Number(row?.value ?? 0);
}
