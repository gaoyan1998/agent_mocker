import type { ChatCompletionRequest, Scenario, ScenarioStep } from '@agent-mock/shared';
import {
  getScenarioCursor,
  listEnabledScenarios,
  setScenarioCursor,
} from '../repositories/scenarios.js';
import { evaluateCondition } from './rule-engine.js';
import type { RequestFacts } from './types.js';

export interface ScenarioMatch {
  scenario: Scenario;
  step: ScenarioStep;
  /** 命中前的游标位置（0 表示 Scenario 刚开始）。 */
  cursor: number;
  nextCursor: number;
}

/**
 * Scenario Engine。
 *
 * 每个 Session 对每个 Scenario 维护一个游标：一次请求只推进一步。
 * 这正好对应 Agent 的多轮往返 —— 「返回 Tool Call → Agent 再次请求 → 返回 Tool Result」
 * 天然被拆成连续的三步。
 */
export function matchScenario(
  projectId: string,
  sessionId: string,
  facts: RequestFacts,
  request: ChatCompletionRequest,
  scenarioIds: string[] = [],
): ScenarioMatch | null {
  const selected = new Set(scenarioIds);
  for (const scenario of listEnabledScenarios(projectId).filter((item) => selected.has(item.id))) {
    let cursor = getScenarioCursor(sessionId, scenario.id);

    if (cursor >= scenario.steps.length) {
      if (!scenario.loop) continue;
      cursor = 0;
    }

    // 只在「还没进入」时校验 trigger，进入之后按 step 顺序推进。
    if (cursor === 0 && !evaluateCondition(scenario.trigger, facts, request)) continue;

    const step = scenario.steps[cursor];
    if (!step) continue;
    if (!evaluateCondition(step.condition, facts, request)) continue;

    return { scenario, step, cursor, nextCursor: cursor + 1 };
  }
  return null;
}

export function commitScenarioStep(sessionId: string, match: ScenarioMatch): void {
  const total = match.scenario.steps.length;
  const next = match.nextCursor >= total && match.scenario.loop ? 0 : match.nextCursor;
  setScenarioCursor(sessionId, match.scenario.id, next);
}
