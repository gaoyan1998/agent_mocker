import type { MockAction, MockEvent } from '@agent-mock/shared';
import { isTerminalEvent } from '@agent-mock/shared';
import { expandAction } from '../engine/action-expander.js';
import { pendingRegistry } from '../engine/pending-registry.js';
import { conflict, notFound } from '../lib/errors.js';
import { findInteractionRow } from '../repositories/interactions.js';
import { recordMockEvent, setInteractionStatus } from './interaction-runtime.js';

export interface ManualApplyResult {
  events: MockEvent[];
  terminal: boolean;
}

/**
 * 人工控制入口。
 *
 * Think / Tool Result 属于「过程事件」：推送后请求继续挂起，UI 可以连续发多条。
 * Reply / Tool Call / Error 属于「终结事件」：推送后请求立即完成。
 */
export function applyManualAction(interactionId: string, action: MockAction): ManualApplyResult {
  const row = findInteractionRow(interactionId);
  if (!row) throw notFound('Interaction');

  const entry = pendingRegistry.get(interactionId);
  if (!entry) {
    throw conflict(
      row.status === 'waiting'
        ? '该请求的连接已断开，无法再操作'
        : `该请求已处于 ${row.status} 状态，无法再操作`,
    );
  }

  const events = expandAction(action, row.projectId);
  if (events.length === 0) throw conflict('该动作没有产生任何事件');

  for (const event of events) {
    recordMockEvent(row, event);
  }

  const terminal = events.some(isTerminalEvent);
  if (terminal) {
    entry.finish(events);
  } else {
    entry.push(...events);
    // 过程事件也刷新一次 UI 状态（等待中 + 新事件）。
    setInteractionStatus(interactionId, 'waiting', 'manual');
  }
  return { events, terminal };
}
