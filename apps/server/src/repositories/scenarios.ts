import { and, asc, eq, inArray } from 'drizzle-orm';
import type {
  MockAction,
  RuleCondition,
  Scenario,
  ScenarioStep,
  ScenarioStepInput,
} from '@agent-mock/shared';
import { db } from '../db/index.js';
import {
  scenarioRuns,
  scenarioSteps,
  scenarios,
  type ScenarioRow,
  type ScenarioStepRow,
} from '../db/schema.js';
import { id } from '../lib/id.js';

function rowToStep(row: ScenarioStepRow): ScenarioStep {
  return {
    id: row.id,
    scenarioId: row.scenarioId,
    sequence: row.sequence,
    name: row.name,
    condition: row.condition ?? null,
    action: row.action,
    createdAt: row.createdAt,
  };
}

function rowToScenario(row: ScenarioRow, steps: ScenarioStep[]): Scenario {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    trigger: row.trigger ?? null,
    loop: row.loop,
    steps,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function stepsFor(scenarioIds: string[]): Map<string, ScenarioStep[]> {
  const map = new Map<string, ScenarioStep[]>();
  if (scenarioIds.length === 0) return map;
  for (const row of db
    .select()
    .from(scenarioSteps)
    .where(inArray(scenarioSteps.scenarioId, scenarioIds))
    .orderBy(asc(scenarioSteps.sequence))
    .all()) {
    const list = map.get(row.scenarioId) ?? [];
    list.push(rowToStep(row));
    map.set(row.scenarioId, list);
  }
  return map;
}

export function listScenarios(projectId: string): Scenario[] {
  const rows = db
    .select()
    .from(scenarios)
    .where(eq(scenarios.projectId, projectId))
    .orderBy(asc(scenarios.createdAt))
    .all();
  const steps = stepsFor(rows.map((row) => row.id));
  return rows.map((row) => rowToScenario(row, steps.get(row.id) ?? []));
}

export function listEnabledScenarios(projectId: string): Scenario[] {
  return listScenarios(projectId).filter((scenario) => scenario.enabled && scenario.steps.length > 0);
}

export function findScenario(scenarioId: string): Scenario | null {
  const row = db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).get();
  if (!row) return null;
  return rowToScenario(row, stepsFor([scenarioId]).get(scenarioId) ?? []);
}

function writeSteps(scenarioId: string, steps: ScenarioStepInput[]): void {
  db.delete(scenarioSteps).where(eq(scenarioSteps.scenarioId, scenarioId)).run();
  const now = Date.now();
  steps.forEach((step, index) => {
    const row: ScenarioStepRow = {
      id: step.id?.startsWith('step_') ? step.id : id('step'),
      scenarioId,
      sequence: index + 1,
      name: step.name ?? '',
      condition: (step.condition ?? null) as RuleCondition | null,
      action: step.action as MockAction,
      createdAt: now,
    };
    db.insert(scenarioSteps).values(row).run();
  });
}

export function createScenario(input: {
  projectId: string;
  name: string;
  description?: string;
  enabled?: boolean;
  trigger?: RuleCondition | null;
  loop?: boolean;
  steps?: ScenarioStepInput[];
}): Scenario {
  const now = Date.now();
  const row: ScenarioRow = {
    id: id('scen'),
    projectId: input.projectId,
    name: input.name,
    description: input.description ?? '',
    enabled: input.enabled ?? true,
    trigger: input.trigger ?? null,
    loop: input.loop ?? false,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(scenarios).values(row).run();
  writeSteps(row.id, input.steps ?? []);
  return findScenario(row.id)!;
}

export function updateScenario(
  scenarioId: string,
  input: {
    name?: string;
    description?: string;
    enabled?: boolean;
    trigger?: RuleCondition | null;
    loop?: boolean;
    steps?: ScenarioStepInput[];
  },
): Scenario | null {
  if (!findScenario(scenarioId)) return null;
  const patch: Partial<ScenarioRow> = { updatedAt: Date.now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.trigger !== undefined) patch.trigger = input.trigger;
  if (input.loop !== undefined) patch.loop = input.loop;
  db.update(scenarios).set(patch).where(eq(scenarios.id, scenarioId)).run();
  if (input.steps !== undefined) writeSteps(scenarioId, input.steps);
  return findScenario(scenarioId);
}

export function deleteScenario(scenarioId: string): boolean {
  db.delete(scenarioSteps).where(eq(scenarioSteps.scenarioId, scenarioId)).run();
  db.delete(scenarioRuns).where(eq(scenarioRuns.scenarioId, scenarioId)).run();
  return db.delete(scenarios).where(eq(scenarios.id, scenarioId)).run().changes > 0;
}

export function deleteScenariosByProject(projectId: string): void {
  const rows = db
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(eq(scenarios.projectId, projectId))
    .all();
  for (const row of rows) deleteScenario(row.id);
}

// ------------------------------------------------------- Scenario 执行游标

export function getScenarioCursor(sessionId: string, scenarioId: string): number {
  const row = db
    .select()
    .from(scenarioRuns)
    .where(and(eq(scenarioRuns.sessionId, sessionId), eq(scenarioRuns.scenarioId, scenarioId)))
    .get();
  return row?.cursor ?? 0;
}

export function setScenarioCursor(sessionId: string, scenarioId: string, cursor: number): void {
  const existing = db
    .select()
    .from(scenarioRuns)
    .where(and(eq(scenarioRuns.sessionId, sessionId), eq(scenarioRuns.scenarioId, scenarioId)))
    .get();
  if (existing) {
    db.update(scenarioRuns)
      .set({ cursor, updatedAt: Date.now() })
      .where(eq(scenarioRuns.id, existing.id))
      .run();
    return;
  }
  db.insert(scenarioRuns)
    .values({
      id: id('srun'),
      sessionId,
      scenarioId,
      cursor,
      updatedAt: Date.now(),
    })
    .run();
}

export function resetScenarioRuns(scenarioId: string): void {
  db.delete(scenarioRuns).where(eq(scenarioRuns.scenarioId, scenarioId)).run();
}

export function resetScenarioRunsForSession(sessionId: string): void {
  db.delete(scenarioRuns).where(eq(scenarioRuns.sessionId, sessionId)).run();
}

export function listScenarioRuns(sessionId: string): Array<{ scenarioId: string; cursor: number }> {
  return db
    .select({ scenarioId: scenarioRuns.scenarioId, cursor: scenarioRuns.cursor })
    .from(scenarioRuns)
    .where(eq(scenarioRuns.sessionId, sessionId))
    .all();
}
