import type {
  ChatCompletionResponse,
  MockAction,
  MockDecision,
  MockDecisionMeta,
  MockEvent,
} from '@agent-mock/shared';
import { findInteractionBySequence } from '../repositories/interactions.js';
import { incrementRuleMatchCount, listEnabledRules } from '../repositories/rules.js';
import { eventsBeforeManual, expandAction, requiresManual } from './action-expander.js';
import { matchRule } from './rule-engine.js';
import { commitScenarioStep, matchScenario } from './scenario-engine.js';
import type { MockContext } from './types.js';
import { forwardToUpstream, resolveUpstream } from '../services/upstream-ai.js';
import { HttpError } from '../lib/errors.js';

/**
 * Mock Engine。
 *
 * 唯一入口 `decide()`：HTTP 层不做任何业务判断，只把 Decision 交给传输层执行。
 * 决策顺序：Replay → Rule → Scenario → 项目兜底行为（默认转人工）。
 */
export async function decide(ctx: MockContext): Promise<MockDecision> {
  const decision =
    decideByReplay(ctx) ?? decideByRule(ctx) ?? decideByScenario(ctx) ?? await decideByDefault(ctx);
  return applyGlobalDelay(ctx, decision);
}

function wrap(
  ctx: MockContext,
  events: MockEvent[],
  meta: MockDecisionMeta,
  action?: MockAction,
): MockDecision {
  if (action && requiresManual(action)) {
    return { type: 'pending', events: eventsBeforeManual(action, ctx.project.id), meta };
  }
  // 纯错误动作直接走错误分支，保持 HTTP 状态码语义。
  if (events.length === 1 && events[0]!.type === 'error') {
    const error = events[0] as Extract<MockEvent, { type: 'error' }>;
    return {
      type: 'error',
      error: {
        status: error.status,
        message: error.message,
        errorType: error.errorType,
        code: error.code,
      },
      meta,
    };
  }
  return { type: ctx.request.stream ? 'stream' : 'response', events, meta };
}

function applyGlobalDelay(ctx: MockContext, decision: MockDecision): MockDecision {
  const delay = ctx.project.settings.responseDelayMs;
  if (delay <= 0) return decision;
  if (decision.type === 'response' || decision.type === 'stream') {
    return { ...decision, events: [{ type: 'delay', ms: delay }, ...decision.events] };
  }
  return decision;
}

// -------------------------------------------------------------------- Replay

/** Session Replay —— 按 sequence 复用源会话录制过的响应。 */
function decideByReplay(ctx: MockContext): MockDecision | null {
  const sourceId = ctx.session.replaySourceId;
  if (!sourceId) return null;

  const source = findInteractionBySequence(sourceId, ctx.interaction.sequence);
  if (!source) return null;

  if (source.error) {
    return {
      type: 'error',
      error: source.error,
      meta: {
        mode: 'replay',
        reason: `回放源会话第 ${ctx.interaction.sequence} 次交互（错误）`,
      },
    };
  }
  if (!source.response) return null;

  const events = eventsFromResponse(source.response);
  if (events.length === 0) return null;

  return {
    type: ctx.request.stream ? 'stream' : 'response',
    events,
    meta: { mode: 'replay', reason: `回放源会话第 ${ctx.interaction.sequence} 次交互` },
  };
}

export function eventsFromResponse(response: ChatCompletionResponse): MockEvent[] {
  const choice = response.choices?.[0];
  if (!choice) return [];
  const events: MockEvent[] = [];
  const message = choice.message;

  if (message.reasoning_content) {
    events.push({ type: 'think', content: message.reasoning_content });
  }
  if (message.tool_calls && message.tool_calls.length > 0) {
    events.push({
      type: 'tool_call',
      toolCalls: message.tool_calls.map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      })),
      ...(message.content ? { content: message.content } : {}),
    });
    return events;
  }
  events.push({
    type: 'assistant',
    content: message.content ?? '',
    finishReason: choice.finish_reason,
  });
  return events;
}

// ---------------------------------------------------------------------- Rule

function decideByRule(ctx: MockContext): MockDecision | null {
  const selected = new Set(ctx.session.ruleIds);
  const rule = matchRule(
    listEnabledRules(ctx.project.id).filter((item) => selected.has(item.id)),
    ctx.facts,
    ctx.request,
  );
  if (!rule) return null;

  incrementRuleMatchCount(rule.id);
  const meta: MockDecisionMeta = {
    mode: 'rule',
    ruleId: rule.id,
    ruleName: rule.name,
    reason: `命中规则「${rule.name}」`,
  };
  return wrap(ctx, expandAction(rule.action, ctx.project.id), meta, rule.action);
}

// ------------------------------------------------------------------ Scenario

function decideByScenario(ctx: MockContext): MockDecision | null {
  const match = matchScenario(
    ctx.project.id,
    ctx.session.id,
    ctx.facts,
    ctx.request,
    ctx.session.scenarioIds,
  );
  if (!match) return null;

  commitScenarioStep(ctx.session.id, match);
  const stepLabel = match.step.name || `第 ${match.step.sequence} 步`;
  const meta: MockDecisionMeta = {
    mode: 'scenario',
    scenarioId: match.scenario.id,
    scenarioName: match.scenario.name,
    scenarioStepId: match.step.id,
    reason: `场景「${match.scenario.name}」${stepLabel}`,
  };
  return wrap(ctx, expandAction(match.step.action, ctx.project.id), meta, match.step.action);
}

// ------------------------------------------------------------------- Default

async function decideByDefault(ctx: MockContext): Promise<MockDecision> {
  const { defaultBehavior, fixedReply } = ctx.project.settings;

  switch (defaultBehavior) {
    case 'echo': {
      const content = ctx.facts.lastUserMessage || '(空消息)';
      return {
        type: ctx.request.stream ? 'stream' : 'response',
        events: [{ type: 'assistant', content: `[echo] ${content}` }],
        meta: { mode: 'auto', reason: '未命中规则，按 echo 兜底' },
      };
    }

    case 'fixed':
      return {
        type: ctx.request.stream ? 'stream' : 'response',
        events: [{ type: 'assistant', content: fixedReply }],
        meta: { mode: 'auto', reason: '未命中规则，返回固定回复' },
      };

    case 'error':
      return {
        type: 'error',
        error: {
          status: 500,
          message: '未命中任何 Rule / Scenario（项目兜底行为为 error）',
          errorType: 'server_error',
          code: 'no_mock_matched',
        },
        meta: { mode: 'auto', reason: '未命中规则，按 error 兜底' },
      };

    case 'manual':
    default: {
      const forwarding = ctx.session.metadata.upstreamForwarding as
        | { enabled?: boolean; upstreamId?: string; model?: string }
        | undefined;
      if (forwarding?.enabled) {
        const selected = resolveUpstream(ctx.project.settings, forwarding.upstreamId)
          ?? resolveUpstream(ctx.project.settings);
        if (selected) {
          let action: MockAction;
          try {
            action = await forwardToUpstream({
              request: ctx.request,
              originalModel: ctx.interaction.model,
              ...(forwarding.model ? { model: forwarding.model } : {}),
              settings: {
                ...ctx.project.settings,
                upstreamBaseUrl: selected.baseUrl,
                upstreamApiKey: selected.apiKey,
                upstreamModel: selected.model,
              },
            });
          } catch (error) {
            return {
              type: 'error',
              error: {
                status: error instanceof HttpError ? error.status : 502,
                message: error instanceof Error ? error.message : '上游 AI 转发失败',
                errorType: 'upstream_error',
                code: error instanceof HttpError ? error.code : 'upstream_error',
              },
              meta: { mode: 'auto', reason: `持续转发到上游「${selected.name}」失败` },
            };
          }
          return wrap(
            ctx,
            expandAction(action, ctx.project.id),
            { mode: 'auto', reason: `未命中规则或场景，持续转发到上游「${selected.name}」` },
            action,
          );
        }
      }
      return {
        type: 'pending',
        events: [],
        meta: { mode: 'manual', reason: '未命中规则，等待人工回复' },
      };
    }
  }
}
