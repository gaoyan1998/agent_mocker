import type { StreamEvent } from '@agent-mock/shared';
import { upsertSession } from './helpers';
import type { GetState, SetState } from './types';

/**
 * SSE 事件合并：只改动受影响的那一条，
 * 避免整页刷新导致的闪烁。
 */
export function applyStreamEvent(event: StreamEvent, set: SetState, get: GetState): void {
  const state = get();
  switch (event.type) {
    case 'session.created':
    case 'session.updated': {
      if (!event.session) return;
      const session = event.session;
      set((current) => ({ sessions: upsertSession(current.sessions, session) }));
      // 还没有选中任何会话时，自动跟到新会话上。
      if (!get().sessionId) void get().selectSession(session.id);
      return;
    }

    case 'session.deleted': {
      set({ sessions: state.sessions.filter((item) => item.id !== event.sessionId) });
      return;
    }

    case 'interaction.created': {
      if (!event.interaction) return;
      if (event.sessionId !== state.sessionId) {
        // 新请求属于其他会话时只更新列表，保留用户在工作台中手动选择的会话。
        void get().refreshSessions();
        return;
      }
      set({
        interactions: [...state.interactions, event.interaction],
        selection: { interactionId: event.interaction.id, eventId: null },
      });
      void get().refreshSessions();
      return;
    }

    case 'interaction.updated':
    case 'interaction.completed': {
      if (!event.interaction || event.sessionId !== state.sessionId) {
        void get().refreshSessions();
        return;
      }
      const incoming = event.interaction;
      set({
        interactions: state.interactions.map((item) =>
          item.id === incoming.id
            ? // 事件列表由 interaction.event 单独维护，这里保留已有的。
              { ...incoming, events: incoming.events ?? item.events }
            : item,
        ),
      });
      return;
    }

    case 'interaction.event': {
      if (!event.event || event.sessionId !== state.sessionId) return;
      const incoming = event.event;
      set({
        interactions: state.interactions.map((item) => {
          if (item.id !== incoming.interactionId) return item;
          const events = item.events ?? [];
          if (events.some((existing) => existing.id === incoming.id)) return item;
          return { ...item, events: [...events, incoming] };
        }),
      });
      return;
    }

    default:
      return;
  }
}
