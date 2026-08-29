import type { MockAction, MockEvent, ResolvedToolCall } from '@agent-mock/shared';
import { newToolCallId } from '../lib/id.js';
import { stringifyArguments } from '../lib/text.js';
import { resolveToolResponse } from '../services/tool-runtime.js';

/**
 * Action → Event 展开器。
 *
 * 原则三「所有行为事件化」：Rule、Scenario、人工操作最终都被
 * 展开成同一种 MockEvent 序列，传输层与时间线只需要理解 MockEvent。
 */
export function expandAction(action: MockAction, projectId: string): MockEvent[] {
  switch (action.type) {
    case 'assistant':
      return [
        {
          type: 'assistant',
          content: action.content,
          ...(action.finishReason ? { finishReason: action.finishReason } : {}),
        },
      ];

    case 'think':
      return [{ type: 'think', content: action.content }];

    case 'tool_call': {
      const toolCalls: ResolvedToolCall[] = action.toolCalls.map((spec) => ({
        id: spec.id?.trim() || newToolCallId(),
        name: spec.name,
        arguments: stringifyArguments(spec.arguments),
      }));
      return [
        {
          type: 'tool_call',
          toolCalls,
          ...(action.content ? { content: action.content } : {}),
        },
      ];
    }

    case 'tool_result': {
      // 不显式给 result 时，从 Tool 配置里解析（static/template/random/sequence/error）。
      if (action.result !== undefined) {
        return [
          {
            type: 'tool_result',
            tool: action.tool,
            result: action.result,
            ...(action.toolCallId ? { toolCallId: action.toolCallId } : {}),
          },
        ];
      }
      const resolved = resolveToolResponse(projectId, action.tool);
      const events: MockEvent[] = [];
      if (resolved.delayMs > 0) events.push({ type: 'delay', ms: resolved.delayMs });
      events.push({
        type: 'tool_result',
        tool: action.tool,
        result: resolved.result,
        ...(action.toolCallId ? { toolCallId: action.toolCallId } : {}),
      });
      return events;
    }

    case 'delay':
      return [{ type: 'delay', ms: action.ms }];

    case 'error':
      return [
        {
          type: 'error',
          status: action.status,
          message: action.message,
          errorType: action.errorType ?? 'server_error',
          code: action.code ?? null,
        },
      ];

    case 'timeout':
      return [
        {
          type: 'error',
          status: 408,
          message: '请求超时（由 Mock Server 模拟）',
          errorType: 'timeout_error',
          code: 'request_timeout',
        },
      ];

    case 'sequence':
      return action.actions.flatMap((child) => expandAction(child, projectId));

    case 'manual':
      // 交给 Manual Mode 处理，本身不产生事件。
      return [];

    default:
      return [];
  }
}

/** 动作（含 sequence 嵌套）里是否要求转入人工模式。 */
export function requiresManual(action: MockAction): boolean {
  if (action.type === 'manual') return true;
  if (action.type === 'sequence') return action.actions.some(requiresManual);
  return false;
}

/** sequence 中 manual 之前的事件：先自动播放这些，再挂起等人工。 */
export function eventsBeforeManual(action: MockAction, projectId: string): MockEvent[] {
  if (action.type === 'manual') return [];
  if (action.type !== 'sequence') return expandAction(action, projectId);
  const events: MockEvent[] = [];
  for (const child of action.actions) {
    if (requiresManual(child)) {
      events.push(...eventsBeforeManual(child, projectId));
      break;
    }
    events.push(...expandAction(child, projectId));
  }
  return events;
}
