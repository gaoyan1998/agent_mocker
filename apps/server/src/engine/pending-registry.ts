import type { MockEvent } from '@agent-mock/shared';

export type PendingCloseReason = 'finished' | 'timeout' | 'aborted';

interface QueueItem {
  kind: 'event' | 'end';
  event?: MockEvent;
}

/**
 * 一个挂起中的 HTTP 请求。
 *
 * 这是 「Request ≠ Response」的落地：HTTP 请求进来后被放进这里，
 * 由 UI 的人工操作逐步推送事件（Think 可以推多次），直到 Reply / Tool Call / Error
 * 这类终结事件把它关闭。流式请求会边推边发，非流式请求在关闭时一次性组装响应。
 */
export class PendingEntry {
  readonly interactionId: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly stream: boolean;
  readonly createdAt = Date.now();

  private readonly queue: QueueItem[] = [];
  private readonly collected: MockEvent[] = [];
  private waiter: (() => void) | null = null;
  private ended = false;
  private reason: PendingCloseReason | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly onClose: (entry: PendingEntry, reason: PendingCloseReason) => void;

  constructor(options: {
    interactionId: string;
    projectId: string;
    sessionId: string;
    stream: boolean;
    timeoutMs: number;
    onTimeout: (entry: PendingEntry) => void;
    onClose: (entry: PendingEntry, reason: PendingCloseReason) => void;
  }) {
    this.interactionId = options.interactionId;
    this.projectId = options.projectId;
    this.sessionId = options.sessionId;
    this.stream = options.stream;
    this.onClose = options.onClose;

    if (options.timeoutMs > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        options.onTimeout(this);
      }, options.timeoutMs);
    }
  }

  get closed(): boolean {
    return this.ended;
  }

  get closeReason(): PendingCloseReason | null {
    return this.reason;
  }

  /** 已经产生过的全部事件（非流式响应据此组装）。 */
  get allEvents(): MockEvent[] {
    return [...this.collected];
  }

  push(...events: MockEvent[]): void {
    if (this.ended) return;
    for (const event of events) {
      this.collected.push(event);
      this.queue.push({ kind: 'event', event });
    }
    this.wake();
  }

  finish(events: MockEvent[] = [], reason: PendingCloseReason = 'finished'): void {
    if (this.ended) return;
    this.push(...events);
    this.ended = true;
    this.reason = reason;
    this.queue.push({ kind: 'end' });
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.wake();
    this.onClose(this, reason);
  }

  private wake(): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.();
  }

  /** 按产生顺序消费事件，直到被 finish 关闭。 */
  async *consume(): AsyncGenerator<MockEvent> {
    for (;;) {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        if (item.kind === 'end') return;
        yield item.event!;
      }
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }
}

class PendingRegistry {
  private readonly entries = new Map<string, PendingEntry>();

  register(options: {
    interactionId: string;
    projectId: string;
    sessionId: string;
    stream: boolean;
    timeoutMs: number;
    onTimeout: (entry: PendingEntry) => void;
  }): PendingEntry {
    const entry = new PendingEntry({
      ...options,
      onClose: (closed) => {
        this.entries.delete(closed.interactionId);
      },
    });
    this.entries.set(options.interactionId, entry);
    return entry;
  }

  get(interactionId: string): PendingEntry | null {
    return this.entries.get(interactionId) ?? null;
  }

  has(interactionId: string): boolean {
    return this.entries.has(interactionId);
  }

  /** 重置会话时中止其中仍挂起的请求，避免删除记录后 HTTP 请求继续等待。 */
  abortSession(sessionId: string): void {
    for (const entry of [...this.entries.values()]) {
      if (entry.sessionId === sessionId) entry.finish([], 'aborted');
    }
  }

  get size(): number {
    return this.entries.size;
  }

  /** 进程退出前，让所有挂起请求收到 503，避免 Agent 侧一直卡住。 */
  drain(): void {
    for (const entry of [...this.entries.values()]) {
      entry.finish(
        [
          {
            type: 'error',
            status: 503,
            message: 'Mock Server 正在关闭',
            errorType: 'server_error',
            code: 'server_shutdown',
          },
        ],
        'aborted',
      );
    }
  }
}

export const pendingRegistry = new PendingRegistry();
