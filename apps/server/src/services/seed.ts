import type { MockAction, RuleCondition } from '@agent-mock/shared';
import { countProjects, createProject } from '../repositories/projects.js';
import { createRule } from '../repositories/rules.js';
import { createScenario } from '../repositories/scenarios.js';
import { createTool } from '../repositories/tools.js';

/**
 * 首次启动时写入一个可直接跑通的示例项目。
 * 目的：`pnpm dev` 之后不需要任何配置，把 base_url 指过来就能看到效果。
 */
export function seedDemoProjectIfEmpty(): string | null {
  if (countProjects() > 0) return null;

  const project = createProject({
    name: '示例项目 · 订单 Agent',
    description: '演示 Rule / Scenario / Tool / 人工控制的完整用法，可以直接删除。',
    apiKey: 'sk-mock-demo',
    settings: { defaultBehavior: 'manual', responseDelayMs: 0, streamChunkIntervalMs: 20 },
  });

  createTool({
    projectId: project.id,
    name: 'get_order',
    description: '查询订单详情',
    parameters: {
      type: 'object',
      properties: { order_id: { type: 'string', description: '订单号' } },
      required: ['order_id'],
    },
    responseMode: 'template',
    response: { order_id: '{{order_id}}', status: 'paid', amount: 199, currency: 'CNY' },
  });

  createTool({
    projectId: project.id,
    name: 'refund_order',
    description: '订单退款',
    parameters: {
      type: 'object',
      properties: { order_id: { type: 'string' }, reason: { type: 'string' } },
      required: ['order_id'],
    },
    responseMode: 'sequence',
    responses: [
      { ok: true, refund_id: 'rf_0001', status: 'refunding' },
      { ok: false, error: 'duplicate refund request' },
    ],
  });

  const containsOrderQuery: RuleCondition = {
    type: 'all',
    conditions: [
      { type: 'contains', value: '查询订单', target: 'last_user_message' },
      { type: 'not', condition: { type: 'contains', value: 'tool', target: 'raw_request' } },
    ],
  };

  const thinkThenToolCall: MockAction = {
    type: 'sequence',
    actions: [
      { type: 'think', content: '用户想查订单，我需要先调用 get_order 拿到订单状态。' },
      {
        type: 'tool_call',
        toolCalls: [{ name: 'get_order', arguments: { order_id: '123456' } }],
      },
    ],
  };

  createRule({
    projectId: project.id,
    name: '订单查询 → Tool Call',
    description: '用户说“查询订单”时，先 Think 再返回 get_order 的 tool call。',
    priority: 10,
    condition: containsOrderQuery,
    action: thinkThenToolCall,
  });

  createRule({
    projectId: project.id,
    name: '收到 Tool 结果 → 给出答复',
    description: 'Agent 把 tool 结果回传后（消息里出现 role=tool），直接给最终回复。',
    priority: 20,
    condition: { type: 'jsonpath', path: 'messages[*].role', op: 'eq', value: 'tool' },
    action: {
      type: 'sequence',
      actions: [
        { type: 'think', content: '订单状态为已支付，可以继续退款流程。' },
        { type: 'assistant', content: '订单 123456 当前状态为「已支付」，可以申请退款。' },
      ],
    },
  });

  createRule({
    projectId: project.id,
    name: '压测限流（默认关闭）',
    description: '演示错误模拟：命中后直接返回 429。',
    enabled: false,
    priority: 5,
    condition: { type: 'contains', value: '__rate_limit__', target: 'raw_request' },
    action: {
      type: 'error',
      status: 429,
      message: 'Rate limit exceeded',
      errorType: 'rate_limit_error',
      code: 'rate_limit',
    },
  });

  createScenario({
    projectId: project.id,
    name: '订单退款全流程',
    description:
      '默认关闭。启用后按步骤推进：Tool Call → Tool Result → 最终回复。',
    enabled: false,
    loop: false,
    trigger: { type: 'contains', value: '退款', target: 'last_user_message' },
    steps: [
      {
        name: '第一步：查订单',
        condition: null,
        action: {
          type: 'sequence',
          actions: [
            { type: 'think', content: '先确认订单状态，再决定能否退款。' },
            { type: 'tool_call', toolCalls: [{ name: 'get_order', arguments: { order_id: '123456' } }] },
          ],
        },
      },
      {
        name: '第二步：发起退款',
        condition: null,
        action: {
          type: 'tool_call',
          toolCalls: [
            { name: 'refund_order', arguments: { order_id: '123456', reason: '用户申请' } },
          ],
        },
      },
      {
        name: '第三步：给出结论',
        condition: null,
        action: { type: 'assistant', content: '退款已发起，预计 1-3 个工作日到账。' },
      },
    ],
  });

  return project.id;
}
