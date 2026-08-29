import { asc, eq, sql } from 'drizzle-orm';
import type { MockAction, Rule, RuleCondition } from '@agent-mock/shared';
import { db } from '../db/index.js';
import { rules, type RuleRow } from '../db/schema.js';
import { id } from '../lib/id.js';

export function rowToRule(row: RuleRow): Rule {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    priority: row.priority,
    condition: row.condition,
    action: row.action,
    matchCount: row.matchCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listRules(projectId: string): Rule[] {
  return db
    .select()
    .from(rules)
    .where(eq(rules.projectId, projectId))
    .orderBy(asc(rules.priority), asc(rules.createdAt))
    .all()
    .map(rowToRule);
}

/** Mock Engine 用：只取启用的规则，按 priority 升序（数值小的先匹配）。 */
export function listEnabledRules(projectId: string): Rule[] {
  return listRules(projectId).filter((rule) => rule.enabled);
}

export function findRule(ruleId: string): Rule | null {
  const row = db.select().from(rules).where(eq(rules.id, ruleId)).get();
  return row ? rowToRule(row) : null;
}

export function createRule(input: {
  projectId: string;
  name: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  condition: RuleCondition;
  action: MockAction;
}): Rule {
  const now = Date.now();
  const row: RuleRow = {
    id: id('rule'),
    projectId: input.projectId,
    name: input.name,
    description: input.description ?? '',
    enabled: input.enabled ?? true,
    priority: input.priority ?? 100,
    condition: input.condition,
    action: input.action,
    matchCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(rules).values(row).run();
  return rowToRule(row);
}

export function updateRule(
  ruleId: string,
  input: {
    name?: string;
    description?: string;
    enabled?: boolean;
    priority?: number;
    condition?: RuleCondition;
    action?: MockAction;
  },
): Rule | null {
  if (!findRule(ruleId)) return null;
  const patch: Partial<RuleRow> = { updatedAt: Date.now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.condition !== undefined) patch.condition = input.condition;
  if (input.action !== undefined) patch.action = input.action;
  db.update(rules).set(patch).where(eq(rules.id, ruleId)).run();
  return findRule(ruleId);
}

export function deleteRule(ruleId: string): boolean {
  return db.delete(rules).where(eq(rules.id, ruleId)).run().changes > 0;
}

export function incrementRuleMatchCount(ruleId: string): void {
  db.update(rules)
    .set({ matchCount: sql`${rules.matchCount} + 1` })
    .where(eq(rules.id, ruleId))
    .run();
}

export function deleteRulesByProject(projectId: string): void {
  db.delete(rules).where(eq(rules.projectId, projectId)).run();
}
