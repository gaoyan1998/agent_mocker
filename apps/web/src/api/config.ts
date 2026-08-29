import type {
  ApiLog,
  CreateRuleInput,
  CreateScenarioInput,
  CreateToolInput,
  MockTool,
  Paginated,
  Rule,
  Scenario,
  ServerInfo,
  UpdateRuleInput,
  UpdateScenarioInput,
  UpdateToolInput,
  UpstreamConnectionInput,
} from '@agent-mock/shared';
import { del, get, post, put } from './client';

export const ruleApi = {
  list: (projectId: string) =>
    get<{ items: Rule[] }>(`/projects/${projectId}/rules`).then((data) => data.items),
  create: (projectId: string, input: CreateRuleInput) =>
    post<Rule>(`/projects/${projectId}/rules`, input),
  update: (ruleId: string, input: UpdateRuleInput) => put<Rule>(`/rules/${ruleId}`, input),
  remove: (ruleId: string) => del(`/rules/${ruleId}`),
};

export const scenarioApi = {
  list: (projectId: string) =>
    get<{ items: Scenario[] }>(`/projects/${projectId}/scenarios`).then((data) => data.items),
  get: (scenarioId: string) => get<Scenario>(`/scenarios/${scenarioId}`),
  create: (projectId: string, input: CreateScenarioInput) =>
    post<Scenario>(`/projects/${projectId}/scenarios`, input),
  update: (scenarioId: string, input: UpdateScenarioInput) =>
    put<Scenario>(`/scenarios/${scenarioId}`, input),
  remove: (scenarioId: string) => del(`/scenarios/${scenarioId}`),
  reset: (scenarioId: string) => post<{ ok: boolean }>(`/scenarios/${scenarioId}/reset`),
};

export const toolApi = {
  list: (projectId: string) =>
    get<{ items: MockTool[] }>(`/projects/${projectId}/tools`).then((data) => data.items),
  sync: (projectId: string, tools: CreateToolInput[]) =>
    post<{ items: MockTool[]; created: number; updated: number }>(
      `/projects/${projectId}/tools/sync`,
      { tools },
    ),
  create: (projectId: string, input: CreateToolInput) =>
    post<MockTool>(`/projects/${projectId}/tools`, input),
  update: (toolId: string, input: UpdateToolInput) => put<MockTool>(`/tools/${toolId}`, input),
  remove: (toolId: string) => del(`/tools/${toolId}`),
  preview: (toolId: string, args: Record<string, unknown>) =>
    post<{ result: unknown; isError: boolean; delayMs: number }>(`/tools/${toolId}/preview`, args),
  resetCursor: (toolId: string) => post<{ ok: boolean }>(`/tools/${toolId}/reset-cursor`),
};

export const logApi = {
  list: (
    projectId: string,
    params?: {
      limit?: number;
      offset?: number;
      sessionId?: string;
      status?: number;
      path?: string;
      from?: number;
      to?: number;
    },
  ) => get<Paginated<ApiLog>>(`/projects/${projectId}/logs`, params),
  clear: (projectId: string) => del(`/projects/${projectId}/logs`),
};

export interface SystemInfo extends ServerInfo {
  pendingRequests: number;
  sseSubscribers: number;
  strictApiKey: boolean;
}

export const systemApi = {
  info: () => get<SystemInfo>('/system/info'),
};

export const upstreamApi = {
  models: (input: UpstreamConnectionInput) =>
    post<{ models: Array<{ id: string; name?: string }> }>('/upstreams/models', input),
};
