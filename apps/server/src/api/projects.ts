import type { FastifyInstance } from 'fastify';
import { createProjectSchema, updateProjectSchema } from '@agent-mock/shared';
import { newApiKey } from '../lib/id.js';
import { deleteLogsByProject } from '../repositories/logs.js';
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from '../repositories/projects.js';
import { deleteRulesByProject } from '../repositories/rules.js';
import { deleteScenariosByProject } from '../repositories/scenarios.js';
import { deleteSessionsByProject } from '../repositories/sessions.js';
import { deleteToolsByProject } from '../repositories/tools.js';
import { listWaitingInteractions } from '../repositories/interactions.js';
import { parseBody, requireProject } from './helpers.js';

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', async () => ({ items: listProjects() }));

  app.post('/api/projects', async (request, reply) => {
    const input = parseBody(createProjectSchema, request.body);
    return reply.code(201).send(createProject(input));
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (request) =>
    requireProject(request.params.id),
  );

  app.put<{ Params: { id: string } }>('/api/projects/:id', async (request) => {
    requireProject(request.params.id);
    const input = parseBody(updateProjectSchema, request.body);
    return updateProject(request.params.id, input);
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/rotate-key', async (request) => {
    requireProject(request.params.id);
    return updateProject(request.params.id, { apiKey: newApiKey() });
  });

  /** 工作台顶栏用：当前项目里所有正在等待人工处理的请求。 */
  app.get<{ Params: { id: string } }>('/api/projects/:id/waiting', async (request) => {
    requireProject(request.params.id);
    return { items: listWaitingInteractions(request.params.id) };
  });

  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    requireProject(request.params.id);
    // 手动级联：SQLite 里没有配外键约束，删除顺序由这里保证。
    deleteSessionsByProject(request.params.id);
    deleteRulesByProject(request.params.id);
    deleteScenariosByProject(request.params.id);
    deleteToolsByProject(request.params.id);
    deleteLogsByProject(request.params.id);
    deleteProject(request.params.id);
    return reply.code(204).send();
  });
}
