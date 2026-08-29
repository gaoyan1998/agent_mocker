import { create } from 'zustand';
import type { MockTool, Rule, Scenario } from '@agent-mock/shared';
import { ruleApi, scenarioApi, toolApi } from '../api/config';

interface ProjectConfigState {
  projectId: string | null;
  tools: MockTool[];
  rules: Rule[];
  scenarios: Scenario[];
  loading: boolean;
  error: string | null;

  /** 切到新项目时拉一次；同一个项目重复调用直接返回，除非传 force。 */
  load: (projectId: string, force?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY = { tools: [], rules: [], scenarios: [] };

/**
 * 工作台需要的项目级配置数据：Tool（Action Panel 的候选）、
 * Rule / Scenario（会话绑定面板）。它们变动很少，进 store 缓存一份，
 * 避免每次进工作台都重新拉。
 */
export const useProjectConfigStore = create<ProjectConfigState>((set, get) => ({
  projectId: null,
  ...EMPTY,
  loading: false,
  error: null,

  load: async (projectId, force = false) => {
    if (!force && get().projectId === projectId) return;
    set({ projectId, ...EMPTY, loading: true, error: null });
    try {
      const [tools, rules, scenarios] = await Promise.all([
        toolApi.list(projectId),
        ruleApi.list(projectId),
        scenarioApi.list(projectId),
      ]);
      // 用户可能在请求期间切换了项目；迟到的响应不能覆盖当前项目的数据。
      if (get().projectId !== projectId) return;
      set({ tools, rules, scenarios, loading: false });
    } catch (error) {
      if (get().projectId !== projectId) return;
      set({
        ...EMPTY,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  refresh: async () => {
    const { projectId } = get();
    if (projectId) await get().load(projectId, true);
  },
}));
