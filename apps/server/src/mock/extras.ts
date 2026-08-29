import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { openAiError } from '@agent-mock/shared';
import { sleep } from '../lib/text.js';
import { listTools } from '../repositories/tools.js';
import { resolveToolResponse } from '../services/tool-runtime.js';
import { resolveProject } from '../services/session-resolver.js';

/**
 * /v1 下的辅助端点。
 *
 * - `/v1/models`：很多 SDK 与 UI（LangChain 的 model 列表、OpenAI 兼容客户端）会先探测它。
 * - `/v1/tools/*`：把「Tool 管理」里配置的假响应直接暴露给 Agent，
 *   这样连 Tool 的真实实现都可以先不写。
 */
export async function registerMockExtras(app: FastifyInstance): Promise<void> {
  const modelsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const project = resolveProject(request.headers as Record<string, unknown>);
    if (!project) {
      return reply
        .code(401)
        .send(openAiError('无效的 API Key', 'invalid_request_error', 'invalid_api_key'));
    }
    const created = Math.floor(project.createdAt / 1000);
    const models = Array.from(
      new Set([project.settings.defaultModel, 'mock-gpt', 'gpt-4o', 'gpt-4o-mini']),
    );
    return reply.send({
      object: 'list',
      data: models.map((model) => ({
        id: model,
        object: 'model',
        created,
        owned_by: 'agent-mock',
      })),
    });
  };
  app.get('/v1/models', modelsHandler);
  app.get('/:sessionId/v1/models', modelsHandler);

  const toolsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const project = resolveProject(request.headers as Record<string, unknown>);
    if (!project) {
      return reply
        .code(401)
        .send(openAiError('无效的 API Key', 'invalid_request_error', 'invalid_api_key'));
    }
    return reply.send({
      object: 'list',
      data: listTools(project.id).map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        response_mode: tool.responseMode,
      })),
    });
  };
  app.get('/v1/tools', toolsHandler);
  app.get('/:sessionId/v1/tools', toolsHandler);

  const toolHandler = async (
    request: FastifyRequest<{ Params: { name: string; sessionId?: string } }>,
    reply: FastifyReply,
  ) => {
    const project = resolveProject(request.headers as Record<string, unknown>);
    if (!project) {
      return reply
        .code(401)
        .send(openAiError('无效的 API Key', 'invalid_request_error', 'invalid_api_key'));
    }
    const resolved = resolveToolResponse(project.id, request.params.name, request.body ?? {});
    if (resolved.delayMs > 0) await sleep(resolved.delayMs);
    if (!resolved.tool) return reply.code(404).send(resolved.result);
    if (resolved.isError) return reply.code(500).send(resolved.result);
    return reply.send(resolved.result);
  };
  app.post<{ Params: { name: string } }>('/v1/tools/:name', toolHandler);
  app.post<{ Params: { name: string; sessionId: string } }>(
    '/:sessionId/v1/tools/:name',
    toolHandler,
  );
}
