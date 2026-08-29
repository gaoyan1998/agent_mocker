import type { FastifyInstance } from 'fastify';
import {
  createSessionSchema,
  replaySessionSchema,
  updateSessionSchema,
  type SessionStatus,
} from '@agent-mock/shared';
import { conflict } from '../lib/errors.js';
import { id } from '../lib/id.js';
import { listInteractions } from '../repositories/interactions.js';
import {
  createSession,
  deleteSession,
  listSessions,
  resetSession,
  updateSession,
} from '../repositories/sessions.js';
import { listScenarioRuns, resetScenarioRunsForSession } from '../repositories/scenarios.js';
import { publish } from '../lib/events.js';
import {
  publishSessionCreated,
  publishSessionUpdated,
} from '../services/session-resolver.js';
import { parseBody, requireProject, requireSession, toNumber } from './helpers.js';

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string; status?: SessionStatus };
  }>('/api/projects/:id/sessions', async (request) => {
    requireProject(request.params.id);
    return listSessions(request.params.id, {
      limit: toNumber(request.query.limit),
      offset: toNumber(request.query.offset),
      status: request.query.status,
    });
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/sessions', async (request, reply) => {
    requireProject(request.params.id);
    const input = parseBody(createSessionSchema, request.body);
    const session = createSession({ projectId: request.params.id, ...input });
    publishSessionCreated(session);
    return reply.code(201).send(session);
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (request) =>
    requireSession(request.params.id),
  );

  app.put<{ Params: { id: string } }>('/api/sessions/:id', async (request) => {
    requireSession(request.params.id);
    const input = parseBody(updateSessionSchema, request.body);
    const session = updateSession(request.params.id, input)!;
    publishSessionUpdated(session);
    return session;
  });

  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const session = requireSession(request.params.id);
    deleteSession(request.params.id);
    publish({
      type: 'session.deleted',
      projectId: session.projectId,
      sessionId: session.id,
    });
    return reply.code(204).send();
  });

  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string; events?: string };
  }>('/api/sessions/:id/interactions', async (request) => {
    requireSession(request.params.id);
    return listInteractions(request.params.id, {
      limit: toNumber(request.query.limit),
      offset: toNumber(request.query.offset),
      withEvents: request.query.events !== 'false',
    });
  });

  /**
   * Session Replay：新建一个绑定源会话的空会话，
   * 并生成专用的 URL 会话 ID。Agent 将其拼接到 /<sessionId>/v1 重跑时，
   * Mock Server 按 sequence 复用源会话录制过的响应。
   */
  app.post<{ Params: { id: string } }>('/api/sessions/:id/replay', async (request, reply) => {
    const source = requireSession(request.params.id);
    if (source.interactionCount === 0) throw conflict('该会话没有可回放的交互记录');
    const input = parseBody(replaySessionSchema, request.body);

    const session = createSession({
      projectId: source.projectId,
      name: input.name ?? `${source.name} · 回放`,
      description:
        input.description ?? `回放会话 ${source.id}（共 ${source.interactionCount} 次交互）`,
      tags: ['replay'],
      externalId: id('replay'),
      auto: false,
      replaySourceId: source.id,
      ruleIds: source.ruleIds ?? [],
      scenarioIds: source.scenarioIds ?? [],
    });
    publishSessionCreated(session);
    return reply.code(201).send(session);
  });

  /** 重置该会话上所有 Scenario 的执行游标，方便反复调试同一个场景。 */
  app.post<{ Params: { id: string } }>('/api/sessions/:id/reset-scenarios', async (request) => {
    requireSession(request.params.id);
    resetScenarioRunsForSession(request.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/sessions/:id/reset', async (request) => {
    requireSession(request.params.id);
    const session = resetSession(request.params.id)!;
    publishSessionUpdated(session);
    return session;
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id/scenario-runs', async (request) => {
    requireSession(request.params.id);
    return { items: listScenarioRuns(request.params.id) };
  });
}
