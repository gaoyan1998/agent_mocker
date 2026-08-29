import type {
  CreateSessionInput,
  DebugSession,
  Interaction,
  Paginated,
  UpdateSessionInput,
} from '@agent-mock/shared';
import { del, get, post, put } from './client';

export const sessionApi = {
  list: (projectId: string, params?: { limit?: number; offset?: number; status?: string }) =>
    get<Paginated<DebugSession>>(`/projects/${projectId}/sessions`, params),
  get: (sessionId: string) => get<DebugSession>(`/sessions/${sessionId}`),
  create: (projectId: string, input: CreateSessionInput = {}) =>
    post<DebugSession>(`/projects/${projectId}/sessions`, input),
  update: (sessionId: string, input: UpdateSessionInput) =>
    put<DebugSession>(`/sessions/${sessionId}`, input),
  remove: (sessionId: string) => del(`/sessions/${sessionId}`),
  interactions: (sessionId: string, params?: { limit?: number; offset?: number }) =>
    get<Paginated<Interaction>>(`/sessions/${sessionId}/interactions`, params),
  replay: (sessionId: string, input?: { name?: string; description?: string }) =>
    post<DebugSession>(`/sessions/${sessionId}/replay`, input ?? {}),
  resetScenarios: (sessionId: string) => post<{ ok: boolean }>(`/sessions/${sessionId}/reset-scenarios`),
  reset: (sessionId: string) => post<DebugSession>(`/sessions/${sessionId}/reset`),
  scenarioRuns: (sessionId: string) =>
    get<{ items: Array<{ scenarioId: string; cursor: number }> }>(
      `/sessions/${sessionId}/scenario-runs`,
    ).then((data) => data.items),
};
