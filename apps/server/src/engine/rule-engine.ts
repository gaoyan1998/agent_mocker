import type {
  ChatCompletionRequest,
  CompareOp,
  ConditionTarget,
  Rule,
  RuleCondition,
} from '@agent-mock/shared';
import { messageContentToText } from '../lib/text.js';
import type { RequestFacts } from './types.js';

/**
 * Rule Engine。
 * 纯函数：给定 RequestFacts + Condition，返回是否命中。没有任何 IO，方便单测。
 */

export function buildFacts(request: ChatCompletionRequest, sequence: number): RequestFacts {
  const messages = request.messages ?? [];
  const texts = messages.map((message) => messageContentToText(message.content));

  let lastUserMessage = '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]!.role === 'user') {
      lastUserMessage = texts[i]!;
      break;
    }
  }

  const systemPrompt = messages
    .map((message, index) =>
      message.role === 'system' || message.role === 'developer' ? texts[index]! : '',
    )
    .filter(Boolean)
    .join('\n');

  const declaredTools = (request.tools ?? [])
    .map((tool) => tool.function?.name)
    .filter((name): name is string => Boolean(name));
  const historyTools = messages.flatMap((message) =>
    (message.tool_calls ?? []).map((call) => call.function.name),
  );

  return {
    model: request.model ?? '',
    messages,
    messageCount: messages.length,
    lastUserMessage,
    lastMessage: texts.length > 0 ? texts[texts.length - 1]! : '',
    allMessages: messages.map((message, index) => `${message.role}: ${texts[index]!}`).join('\n'),
    systemPrompt,
    rawRequest: safeStringify(request),
    toolNames: Array.from(new Set([...declaredTools, ...historyTools])),
    sequence,
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

function targetText(facts: RequestFacts, target: ConditionTarget = 'last_user_message'): string {
  switch (target) {
    case 'last_message':
      return facts.lastMessage;
    case 'all_messages':
      return facts.allMessages;
    case 'system_prompt':
      return facts.systemPrompt;
    case 'raw_request':
      return facts.rawRequest;
    case 'last_user_message':
    default:
      return facts.lastUserMessage;
  }
}

export function compare(op: CompareOp, left: unknown, right: unknown): boolean {
  switch (op) {
    case 'exists':
      return left !== undefined && left !== null;
    case 'eq':
      return looseEquals(left, right);
    case 'ne':
      return !looseEquals(left, right);
    case 'gt':
      return toNumber(left) > toNumber(right);
    case 'gte':
      return toNumber(left) >= toNumber(right);
    case 'lt':
      return toNumber(left) < toNumber(right);
    case 'lte':
      return toNumber(left) <= toNumber(right);
    case 'contains':
      return String(left ?? '').includes(String(right ?? ''));
    case 'regex':
      try {
        return new RegExp(String(right ?? '')).test(String(left ?? ''));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function looseEquals(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  if (typeof left === 'object' || typeof right === 'object') {
    return safeStringify(left) === safeStringify(right);
  }
  return String(left) === String(right);
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * 迷你 JSONPath：支持 `a.b`、`a[0].b`、`a[*].b`、可选的 `$.` 前缀。
 * 返回所有命中的值（`*` 会展开成多个）。
 */
export function resolvePath(root: unknown, path: string): unknown[] {
  const normalized = path
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+|\*)\]/g, '.$1')
    .split('.')
    .filter((segment) => segment !== '');

  let current: unknown[] = [root];
  for (const segment of normalized) {
    const next: unknown[] = [];
    for (const value of current) {
      if (value == null) continue;
      if (segment === '*') {
        if (Array.isArray(value)) next.push(...value);
        else if (typeof value === 'object') next.push(...Object.values(value as object));
        continue;
      }
      if (Array.isArray(value)) {
        const index = Number(segment);
        if (Number.isInteger(index)) {
          const item = index < 0 ? value[value.length + index] : value[index];
          if (item !== undefined) next.push(item);
        }
        continue;
      }
      if (typeof value === 'object') {
        const item = (value as Record<string, unknown>)[segment];
        if (item !== undefined) next.push(item);
      }
    }
    current = next;
    if (current.length === 0) return [];
  }
  return current;
}

export function evaluateCondition(
  condition: RuleCondition | null | undefined,
  facts: RequestFacts,
  request: ChatCompletionRequest,
): boolean {
  if (!condition) return true;

  switch (condition.type) {
    case 'always':
      return true;

    case 'contains': {
      const text = targetText(facts, condition.target);
      return condition.ignoreCase
        ? text.toLowerCase().includes(condition.value.toLowerCase())
        : text.includes(condition.value);
    }

    case 'equals': {
      const text = targetText(facts, condition.target).trim();
      const expected = condition.value.trim();
      return condition.ignoreCase
        ? text.toLowerCase() === expected.toLowerCase()
        : text === expected;
    }

    case 'regex': {
      try {
        return new RegExp(condition.value, condition.flags ?? '').test(
          targetText(facts, condition.target),
        );
      } catch {
        return false;
      }
    }

    case 'model':
      return facts.model === condition.value;

    case 'tool':
      return facts.toolNames.includes(condition.value);

    case 'message_count':
      return compare(condition.op, facts.messageCount, condition.value);

    case 'sequence_index':
      return compare(condition.op, facts.sequence, condition.value);

    case 'jsonpath': {
      const values = resolvePath(request, condition.path);
      if (condition.op === 'exists') return values.length > 0;
      return values.some((value) => compare(condition.op, value, condition.value));
    }

    case 'all':
      return condition.conditions.every((child) => evaluateCondition(child, facts, request));

    case 'any':
      return condition.conditions.some((child) => evaluateCondition(child, facts, request));

    case 'not':
      return !evaluateCondition(condition.condition, facts, request);

    default:
      return false;
  }
}

/** 按 priority 升序返回第一个命中的规则。 */
export function matchRule(
  candidates: Rule[],
  facts: RequestFacts,
  request: ChatCompletionRequest,
): Rule | null {
  for (const rule of candidates) {
    if (evaluateCondition(rule.condition, facts, request)) return rule;
  }
  return null;
}
