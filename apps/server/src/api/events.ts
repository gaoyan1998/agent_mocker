import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ServerResponse } from 'node:http';
import type { StreamEvent } from '@agent-mock/shared';
import { config } from '../config.js';
import { eventBus } from '../lib/events.js';
import { requireProject, requireSession } from './helpers.js';

/**
 * 实时通信：REST + SSE。
 * 工作台订阅项目级事件流即可覆盖「新会话 / 新请求 / 状态变化 / 新事件」。
 */
export async function registerEventRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/api/projects/:id/events', async (request, reply) => {
    const project = requireProject(request.params.id);
    openStream(reply, (event) => event.projectId === project.id);
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id/events', async (request, reply) => {
    const session = requireSession(request.params.id);
    openStream(reply, (event) => event.sessionId === session.id);
  });
}

function openStream(reply: FastifyReply, filter: (event: StreamEvent) => boolean): void {
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  send(raw, { type: 'ready', projectId: '', at: Date.now() } as StreamEvent);

  const unsubscribe = eventBus.subscribe((event) => {
    if (!filter(event)) return;
    send(raw, event);
  });

  const ping = setInterval(() => {
    if (raw.writableEnded) return;
    raw.write(': ping\n\n');
  }, config.ssePingIntervalMs);

  const cleanup = () => {
    clearInterval(ping);
    unsubscribe();
  };
  raw.on('close', cleanup);
  raw.on('error', cleanup);
}

function send(raw: ServerResponse, event: StreamEvent): void {
  if (raw.writableEnded) return;
  raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
