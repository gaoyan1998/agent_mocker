import { EventEmitter } from 'node:events';
import type { StreamEvent } from '@agent-mock/shared';

/**
 * 进程内事件总线：Mock Engine / 管理 API 产生的状态变化，通过它推给所有 SSE 连接。
 * 第一阶段只需要 Server → Browser，SSE 足够，不引入 WebSocket。
 */
class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // 每个打开的工作台页面都会挂一个 listener，默认上限 10 太小。
    this.emitter.setMaxListeners(0);
  }

  publish(event: StreamEvent): void {
    this.emitter.emit('event', event);
  }

  subscribe(listener: (event: StreamEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => {
      this.emitter.off('event', listener);
    };
  }

  get subscriberCount(): number {
    return this.emitter.listenerCount('event');
  }
}

export const eventBus = new EventBus();

export function publish(event: Omit<StreamEvent, 'at'> & { at?: number }): void {
  eventBus.publish({ ...event, at: event.at ?? Date.now() } as StreamEvent);
}
