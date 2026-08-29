import { useEffect } from 'react';
import { STREAM_EVENT_TYPES, type StreamEvent } from '@agent-mock/shared';
import { useWorkbenchStore } from '../stores/workbench';

/**
 * 订阅项目级 SSE。
 * 一个连接就能覆盖「新会话 / 新请求 / 状态变化 / 新事件」，比按会话订阅省心。
 */
export function useProjectStream(projectId: string | undefined): void {
  useEffect(() => {
    if (!projectId) return;
    const { handleEvent, setConnected } = useWorkbenchStore.getState();

    const source = new EventSource(`/api/projects/${projectId}/events`);
    const onMessage = (event: MessageEvent<string>) => {
      try {
        handleEvent(JSON.parse(event.data) as StreamEvent);
      } catch {
        // 忽略无法解析的帧（例如心跳注释）。
      }
    };

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    for (const type of STREAM_EVENT_TYPES) {
      if (type === 'ready') {
        source.addEventListener(type, () => setConnected(true));
        continue;
      }
      source.addEventListener(type, onMessage as EventListener);
    }

    return () => {
      source.close();
      setConnected(false);
    };
  }, [projectId]);
}
