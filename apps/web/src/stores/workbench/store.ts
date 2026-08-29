import { create } from 'zustand';
import { sessionApi } from '../../api/session';
import { applyStreamEvent } from './events';
import { replaceSession, sortSessions, upsertSession } from './helpers';
import { EMPTY_SELECTION, type WorkbenchState } from './types';
import { t } from '../../i18n';

/** 一次拉取的上限：会话列表和交互列表都远小于这个量级。 */
const SESSION_PAGE_SIZE = 200;
const INTERACTION_PAGE_SIZE = 300;

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  projectId: null,
  sessions: [],
  sessionId: null,
  interactions: [],
  selection: EMPTY_SELECTION,
  loadingSessions: false,
  loadingInteractions: false,
  connected: false,

  bootstrap: async (projectId) => {
    if (get().projectId !== projectId) {
      set({
        projectId,
        sessions: [],
        sessionId: null,
        interactions: [],
        selection: EMPTY_SELECTION,
      });
    }
    set({ loadingSessions: true });
    const page = await sessionApi.list(projectId, { limit: SESSION_PAGE_SIZE });
    const sessions = sortSessions(page.items);
    set({ sessions, loadingSessions: false });

    const active = get().sessionId ?? sessions[0]?.id ?? null;
    if (active) await get().selectSession(active);
  },

  refreshSessions: async () => {
    const { projectId } = get();
    if (!projectId) return;
    const page = await sessionApi.list(projectId, { limit: SESSION_PAGE_SIZE });
    set({ sessions: sortSessions(page.items) });
  },

  selectSession: async (sessionId) => {
    set({
      sessionId,
      loadingInteractions: true,
      interactions: [],
      selection: EMPTY_SELECTION,
    });
    const page = await sessionApi.interactions(sessionId, { limit: INTERACTION_PAGE_SIZE });
    // 用户可能在请求期间切换了会话；迟到的响应不能覆盖当前会话的内容和选中项。
    if (get().sessionId !== sessionId) return;
    // 默认选中「正在等待」的那一条，没有的话选最后一条。
    const waiting = page.items.find((item) => item.status === 'waiting');
    const target = waiting ?? page.items[page.items.length - 1] ?? null;
    set({
      interactions: page.items,
      loadingInteractions: false,
      selection: { interactionId: target?.id ?? null, eventId: null },
    });
  },

  refreshInteractions: async () => {
    const { sessionId } = get();
    if (!sessionId) return;
    const page = await sessionApi.interactions(sessionId, { limit: INTERACTION_PAGE_SIZE });
    set({ interactions: page.items });
  },

  select: (interactionId, eventId = null) => set({ selection: { interactionId, eventId } }),

  newSession: async (name) => {
    const { projectId } = get();
    if (!projectId) throw new Error(t('workbench.noProjectSelected'));
    // 手动创建的会话立即分配一个可用于 Agent 请求的外部 Session ID。
    const externalId = `debug-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const session = await sessionApi.create(projectId, {
      ...(name ? { name } : {}),
      externalId,
    });
    set((state) => ({ sessions: upsertSession(state.sessions, session) }));
    await get().selectSession(session.id);
    return session;
  },

  endSession: async (sessionId) => {
    const session = await sessionApi.update(sessionId, { status: 'completed' });
    set((state) => ({ sessions: sortSessions(replaceSession(state.sessions, session)) }));
  },

  reopenSession: async (sessionId) => {
    const session = await sessionApi.update(sessionId, { status: 'active' });
    set((state) => ({ sessions: sortSessions(replaceSession(state.sessions, session)) }));
  },

  deleteSession: async (sessionId) => {
    await sessionApi.remove(sessionId);
    const remaining = get().sessions.filter((item) => item.id !== sessionId);
    set({ sessions: remaining });
    if (get().sessionId === sessionId) {
      const next = remaining[0]?.id ?? null;
      if (next) await get().selectSession(next);
      else set({ sessionId: null, interactions: [], selection: EMPTY_SELECTION });
    }
  },

  replaySession: async (sessionId) => {
    const session = await sessionApi.replay(sessionId);
    set((state) => ({ sessions: upsertSession(state.sessions, session) }));
    await get().selectSession(session.id);
    return session;
  },

  resetSession: async (sessionId) => {
    const session = await sessionApi.reset(sessionId);
    set((state) => ({ sessions: upsertSession(state.sessions, session) }));
    if (get().sessionId === sessionId) {
      await get().selectSession(sessionId);
    }
  },

  updateSessionBindings: async (ruleIds, scenarioIds) => {
    const { sessionId } = get();
    if (!sessionId) throw new Error(t('workbench.noSessionSelected'));
    const session = await sessionApi.update(sessionId, { ruleIds, scenarioIds });
    await sessionApi.resetScenarios(sessionId);
    set((state) => ({ sessions: replaceSession(state.sessions, session) }));
  },

  setSession: (session) => set((state) => ({ sessions: replaceSession(state.sessions, session) })),

  setConnected: (connected) => set({ connected }),

  handleEvent: (event) => applyStreamEvent(event, set, get),
}));
