import type { FastifyInstance } from 'fastify';
import {
  createRuleSchema,
  createScenarioSchema,
  createToolSchema,
  updateRuleSchema,
  updateScenarioSchema,
  updateToolSchema,
  syncToolsSchema,
  upstreamConnectionSchema,
} from '@agent-mock/shared';
import { conflict, notFound } from '../lib/errors.js';
import { createRule, deleteRule, findRule, listRules, updateRule } from '../repositories/rules.js';
import {
  createScenario,
  deleteScenario,
  findScenario,
  listScenarios,
  resetScenarioRuns,
  updateScenario,
} from '../repositories/scenarios.js';
import {
  createTool,
  deleteTool,
  findTool,
  findToolByName,
  listTools,
  syncTools,
  resetToolCursor,
  updateTool,
} from '../repositories/tools.js';
import { resolveToolResponse } from '../services/tool-runtime.js';
import { parseBody, requireProject } from './helpers.js';
import { fetchUpstreamModels } from '../services/upstream-ai.js';

/** Rule / Scenario / Tool 的 CRUD。 */
export async function registerConfigRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/upstreams/models', async (request) => {
    const input = parseBody(upstreamConnectionSchema, request.body);
    const models = await fetchUpstreamModels(input.baseUrl, input.apiKey);
    return { models };
  });

  // ------------------------------------------------------------------ Rules
  app.get<{ Params: { id: string } }>('/api/projects/:id/rules', async (request) => {
    requireProject(request.params.id);
    return { items: listRules(request.params.id) };
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/rules', async (request, reply) => {
    requireProject(request.params.id);
    const input = parseBody(createRuleSchema, request.body);
    return reply.code(201).send(createRule({ projectId: request.params.id, ...input }));
  });

  app.put<{ Params: { id: string } }>('/api/rules/:id', async (request) => {
    if (!findRule(request.params.id)) throw notFound('规则');
    const input = parseBody(updateRuleSchema, request.body);
    return updateRule(request.params.id, input);
  });

  app.delete<{ Params: { id: string } }>('/api/rules/:id', async (request, reply) => {
    if (!deleteRule(request.params.id)) throw notFound('规则');
    return reply.code(204).send();
  });

  // -------------------------------------------------------------- Scenarios
  app.get<{ Params: { id: string } }>('/api/projects/:id/scenarios', async (request) => {
    requireProject(request.params.id);
    return { items: listScenarios(request.params.id) };
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/scenarios', async (request, reply) => {
    requireProject(request.params.id);
    const input = parseBody(createScenarioSchema, request.body);
    return reply.code(201).send(createScenario({ projectId: request.params.id, ...input }));
  });

  app.get<{ Params: { id: string } }>('/api/scenarios/:id', async (request) => {
    const scenario = findScenario(request.params.id);
    if (!scenario) throw notFound('场景');
    return scenario;
  });

  app.put<{ Params: { id: string } }>('/api/scenarios/:id', async (request) => {
    if (!findScenario(request.params.id)) throw notFound('场景');
    const input = parseBody(updateScenarioSchema, request.body);
    return updateScenario(request.params.id, input);
  });

  app.post<{ Params: { id: string } }>('/api/scenarios/:id/reset', async (request) => {
    if (!findScenario(request.params.id)) throw notFound('场景');
    resetScenarioRuns(request.params.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/scenarios/:id', async (request, reply) => {
    if (!deleteScenario(request.params.id)) throw notFound('场景');
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ Tools
  app.get<{ Params: { id: string } }>('/api/projects/:id/tools', async (request) => {
    requireProject(request.params.id);
    return { items: listTools(request.params.id) };
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/tools/sync', async (request) => {
    requireProject(request.params.id);
    const input = parseBody(syncToolsSchema, request.body);
    return syncTools(request.params.id, input.tools);
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/tools', async (request, reply) => {
    requireProject(request.params.id);
    const input = parseBody(createToolSchema, request.body);
    if (findToolByName(request.params.id, input.name)) {
      throw conflict(`Tool「${input.name}」已存在`);
    }
    return reply.code(201).send(createTool({ projectId: request.params.id, ...input }));
  });

  app.put<{ Params: { id: string } }>('/api/tools/:id', async (request) => {
    const existing = findTool(request.params.id);
    if (!existing) throw notFound('Tool');
    const input = parseBody(updateToolSchema, request.body);
    if (input.name && input.name !== existing.name) {
      const duplicated = findToolByName(existing.projectId, input.name);
      if (duplicated) throw conflict(`Tool「${input.name}」已存在`);
    }
    return updateTool(request.params.id, input);
  });

  app.delete<{ Params: { id: string } }>('/api/tools/:id', async (request, reply) => {
    if (!deleteTool(request.params.id)) throw notFound('Tool');
    return reply.code(204).send();
  });

  /** 在 UI 里预览一次 Tool 的 mock 响应（random / sequence 会真实推进游标）。 */
  app.post<{ Params: { id: string } }>('/api/tools/:id/preview', async (request) => {
    const tool = findTool(request.params.id);
    if (!tool) throw notFound('Tool');
    const resolved = resolveToolResponse(tool.projectId, tool.name, request.body ?? {});
    return { result: resolved.result, isError: resolved.isError, delayMs: resolved.delayMs };
  });

  app.post<{ Params: { id: string } }>('/api/tools/:id/reset-cursor', async (request) => {
    if (!findTool(request.params.id)) throw notFound('Tool');
    resetToolCursor(request.params.id);
    return { ok: true };
  });
}
