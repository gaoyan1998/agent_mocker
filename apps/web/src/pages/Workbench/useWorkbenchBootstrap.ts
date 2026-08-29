import { useEffect } from 'react';
import { useProjectConfigStore } from '@/stores/projectConfig';
import { useWorkbenchStore } from '@/stores/workbench';

/**
 * 进入工作台 / 切换项目时的数据准备：
 * 会话与交互走 workbench store，Tool / Rule / Scenario 走 projectConfig store。
 * 项目级 SSE 在 ProjectLayout 建立，这里不重复订阅。
 */
export function useWorkbenchBootstrap(projectId: string): void {
  useEffect(() => {
    if (!projectId) return;
    void useWorkbenchStore.getState().bootstrap(projectId);
    void useProjectConfigStore.getState().load(projectId);
  }, [projectId]);
}
