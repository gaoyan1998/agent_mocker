import type { MockAction, RuleCondition } from './mock.js';

/** 条件/动作的可读摘要，用于 Rule、Scenario 列表页的展示。 */

export type DescribeLang = 'zh' | 'en';

const TARGET_LABEL: Record<DescribeLang, Record<string, string>> = {
  zh: {
    last_user_message: '最后一条用户消息',
    last_message: '最后一条消息',
    all_messages: '全部消息',
    system_prompt: 'System Prompt',
    raw_request: '原始请求',
  },
  en: {
    last_user_message: 'last user message',
    last_message: 'last message',
    all_messages: 'all messages',
    system_prompt: 'system prompt',
    raw_request: 'raw request',
  },
};

const OP_LABEL: Record<DescribeLang, Record<string, string>> = {
  zh: {
    eq: '=',
    ne: '≠',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    contains: '包含',
    regex: '匹配',
    exists: '存在',
  },
  en: {
    eq: '=',
    ne: '≠',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    contains: 'contains',
    regex: 'matches',
    exists: 'exists',
  },
};

export function describeCondition(
  condition: RuleCondition | null | undefined,
  lang: DescribeLang = 'zh',
): string {
  const target = (key: string | undefined) => TARGET_LABEL[lang][key ?? 'last_user_message'];
  const op = (key: string) => OP_LABEL[lang][key] ?? key;
  const zh = lang === 'zh';

  if (!condition) return zh ? '任意请求' : 'any request';
  switch (condition.type) {
    case 'always':
      return zh ? '任意请求' : 'any request';
    case 'contains':
      return zh
        ? `${target(condition.target)} 包含「${condition.value}」`
        : `${target(condition.target)} contains “${condition.value}”`;
    case 'equals':
      return zh
        ? `${target(condition.target)} 等于「${condition.value}」`
        : `${target(condition.target)} equals “${condition.value}”`;
    case 'regex':
      return zh
        ? `${target(condition.target)} 匹配 /${condition.value}/`
        : `${target(condition.target)} matches /${condition.value}/`;
    case 'model':
      return `model = ${condition.value}`;
    case 'tool':
      return zh ? `请求包含 tool ${condition.value}` : `request contains tool ${condition.value}`;
    case 'message_count':
      return zh
        ? `消息数 ${op(condition.op)} ${condition.value}`
        : `message count ${op(condition.op)} ${condition.value}`;
    case 'sequence_index':
      return zh
        ? `第 ${op(condition.op)} ${condition.value} 次请求`
        : `request index ${op(condition.op)} ${condition.value}`;
    case 'jsonpath':
      return `${condition.path} ${op(condition.op)} ${formatValue(condition.value)}`;
    case 'all':
      return condition.conditions
        .map((item) => describeCondition(item, lang))
        .join(zh ? ' 且 ' : ' and ');
    case 'any':
      return condition.conditions
        .map((item) => describeCondition(item, lang))
        .join(zh ? ' 或 ' : ' or ');
    case 'not':
      return zh
        ? `非（${describeCondition(condition.condition, lang)}）`
        : `not (${describeCondition(condition.condition, lang)})`;
    default:
      return zh ? '未知条件' : 'unknown condition';
  }
}

export function describeAction(action: MockAction, lang: DescribeLang = 'zh'): string {
  const zh = lang === 'zh';
  switch (action.type) {
    case 'assistant':
      return zh ? `回复「${clip(action.content)}」` : `reply “${clip(action.content)}”`;
    case 'think':
      return zh ? `Think「${clip(action.content)}」` : `think “${clip(action.content)}”`;
    case 'tool_call':
      return `Tool Call ${action.toolCalls.map((call) => call.name).join(', ')}`;
    case 'tool_result':
      return `Tool Result ${action.tool}${
        action.result === undefined ? (zh ? '（用 Tool 配置）' : ' (from tool config)') : ''
      }`;
    case 'delay':
      return zh ? `延迟 ${action.ms}ms` : `delay ${action.ms}ms`;
    case 'error':
      return zh
        ? `返回 ${action.status} ${clip(action.message, 20)}`
        : `return ${action.status} ${clip(action.message, 20)}`;
    case 'timeout':
      return zh ? '模拟超时（408）' : 'simulate timeout (408)';
    case 'manual':
      return zh ? '转人工等待' : 'wait for an operator';
    case 'sequence':
      return action.actions.map((item) => describeAction(item, lang)).join(' → ');
    default:
      return zh ? '未知动作' : 'unknown action';
  }
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function clip(text: string, max = 18): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length <= max ? single : `${single.slice(0, max)}…`;
}
