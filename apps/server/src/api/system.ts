import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { deleteLogsByProject, listLogs } from '../repositories/logs.js';
import { countInteractions } from '../repositories/interactions.js';
import { countProjects } from '../repositories/projects.js';
import { countSessions } from '../repositories/sessions.js';
import { pendingRegistry } from '../engine/pending-registry.js';
import { eventBus } from '../lib/events.js';
import { requireProject, toNumber } from './helpers.js';

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true, uptimeMs: Date.now() - config.startedAt }));

  app.get('/api/system/info', async (request) => {
    const host = request.headers.host ?? `localhost:${config.port}`;
    const protocol = (request.headers['x-forwarded-proto'] as string) ?? request.protocol;
    return {
      name: 'AI Agent Mock Server',
      version: config.version,
      startedAt: config.startedAt,
      databasePath: config.databasePath,
      baseUrl: `${protocol}://${host}/api`,
      mockBaseUrl: `${protocol}://${host}/v1`,
      projectCount: countProjects(),
      sessionCount: countSessions(),
      interactionCount: countInteractions(),
      pendingRequests: pendingRegistry.size,
      sseSubscribers: eventBus.subscriberCount,
      strictApiKey: config.strictApiKey,
    };
  });

  // ------------------------------------------------------------- API 日志
  app.get<{
    Params: { id: string };
    Querystring: {
      limit?: string;
      offset?: string;
      sessionId?: string;
      status?: string;
      path?: string;
      from?: string;
      to?: string;
    };
  }>('/api/projects/:id/logs', async (request) => {
    requireProject(request.params.id);
    return listLogs(request.params.id, {
      limit: toNumber(request.query.limit),
      offset: toNumber(request.query.offset),
      sessionId: request.query.sessionId,
      status: toNumber(request.query.status),
      path: request.query.path,
      from: toNumber(request.query.from),
      to: toNumber(request.query.to),
    });
  });

  app.delete<{ Params: { id: string } }>('/api/projects/:id/logs', async (request, reply) => {
    requireProject(request.params.id);
    deleteLogsByProject(request.params.id);
    return reply.code(204).send();
  });
}
