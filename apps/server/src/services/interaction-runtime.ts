import type {
  ChatCompletionResponse,
  Interaction,
  InteractionEvent,
  InteractionEventType,
  InteractionMode,
  InteractionStatus,
  MockErrorSpec,
  MockEvent,
  StreamEventType,
} from '@agent-mock/shared';
import { publish } from '../lib/events.js';
import { appendEvent, updateInteraction } from '../repositories/interactions.js';
import { touchSession } from '../repositories/sessions.js';

/**
 * Interaction 的写入 + 实时广播。
 * 所有状态变化都从这里出去，保证「数据库有记录、UI 有推送」两件事不会脱节。
 */

function publishInteraction(type: StreamEventType, interaction: Interaction): void {
  publish({
    type,
    projectId: interaction.projectId,
    sessionId: interaction.sessionId,
    interactionId: interaction.id,
    interaction,
  });
}

export function recordEvent(
  interaction: { id: string; projectId: string; sessionId: string },
  type: InteractionEventType,
  payload: Record<string, unknown>,
): InteractionEvent {
  const event = appendEvent(interaction.id, type, payload);
  publish({
    type: 'interaction.event',
    projectId: interaction.projectId,
    sessionId: interaction.sessionId,
    interactionId: interaction.id,
    event,
  });
  return event;
}

/** MockEvent → InteractionEvent 落库。delay 也记录，时间线上才看得出等待。 */
export function recordMockEvent(
  interaction: { id: string; projectId: string; sessionId: string },
  event: MockEvent,
): InteractionEvent {
  switch (event.type) {
    case 'think':
      return recordEvent(interaction, 'think', { content: event.content });
    case 'assistant':
      return recordEvent(interaction, 'assistant', {
        content: event.content,
        finishReason: event.finishReason ?? 'stop',
      });
    case 'tool_call':
      return recordEvent(interaction, 'tool_call', {
        toolCalls: event.toolCalls,
        ...(event.content ? { content: event.content } : {}),
      });
    case 'tool_result':
      return recordEvent(interaction, 'tool_result', {
        tool: event.tool,
        result: event.result,
        ...(event.toolCallId ? { toolCallId: event.toolCallId } : {}),
      });
    case 'delay':
      return recordEvent(interaction, 'delay', { ms: event.ms });
    case 'error':
      return recordEvent(interaction, 'error', {
        status: event.status,
        message: event.message,
        errorType: event.errorType,
        code: event.code,
      });
    default:
      return recordEvent(interaction, 'request', event as Record<string, unknown>);
  }
}

export function setInteractionStatus(
  interactionId: string,
  status: InteractionStatus,
  mode?: InteractionMode,
): void {
  const updated = updateInteraction(interactionId, { status, ...(mode ? { mode } : {}) });
  if (updated) {
    touchSession(updated.sessionId);
    publishInteraction('interaction.updated', updated);
  }
}

export function completeInteraction(
  interactionId: string,
  response: ChatCompletionResponse,
  latencyMs: number,
): void {
  const updated = updateInteraction(interactionId, {
    status: 'completed',
    response,
    error: null,
    latencyMs: Math.round(latencyMs),
    completedAt: Date.now(),
  });
  if (updated) {
    touchSession(updated.sessionId);
    publishInteraction('interaction.completed', updated);
  }
}

export function failInteraction(
  interactionId: string,
  error: MockErrorSpec,
  latencyMs: number,
  status: InteractionStatus = 'error',
): void {
  const updated = updateInteraction(interactionId, {
    status,
    error,
    latencyMs: Math.round(latencyMs),
    completedAt: Date.now(),
  });
  if (updated) {
    touchSession(updated.sessionId);
    publishInteraction('interaction.completed', updated);
  }
}
