import type { FastifyInstance } from 'fastify';
import {
  errorActionSchema,
  genericActionSchema,
  replyActionSchema,
  thinkActionSchema,
  toolCallActionSchema,
  toolResultActionSchema,
  upstreamActionSchema,
  type MockAction,
} from '@agent-mock/shared';
import { badRequest } from '../lib/errors.js';
import { applyManualAction } from '../services/manual-control.js';
import { parseBody, requireInteraction } from './helpers.js';
import { findInteractionRow } from '../repositories/interactions.js';
import { findProject } from '../repositories/projects.js';
import { forwardToUpstream, resolveUpstream } from '../services/upstream-ai.js';

/**
 * 人工控制 API。
 * 每个端点都只是「构造一个 MockAction 交给 applyManualAction」。
 */
export async function registerInteractionRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/api/interactions/:id', async (request) =>
    requireInteraction(request.params.id),
  );

  app.post<{ Params: { id: string } }>('/api/interactions/:id/reply', async (request) => {
    const input = parseBody(replyActionSchema, request.body);
    const action = withDelay(
      {
        type: 'assistant',
        content: input.content,
        ...(input.finishReason ? { finishReason: input.finishReason } : {}),
      },
      input.delayMs,
    );
    return respond(request.params.id, action);
  });

  app.post<{ Params: { id: string } }>('/api/interactions/:id/think', async (request) => {
    const input = parseBody(thinkActionSchema, request.body);
    return respond(request.params.id, { type: 'think', content: input.content });
  });

  app.post<{ Params: { id: string } }>('/api/interactions/:id/tool-call', async (request) => {
    const input = parseBody(toolCallActionSchema, request.body);
    const toolCalls =
      input.toolCalls ??
      (input.name ? [{ name: input.name, arguments: input.arguments }] : undefined);
    if (!toolCalls || toolCalls.length === 0) {
      throw badRequest('至少需要提供一个 Tool Call（toolCalls 或 name）');
    }
    const action = withDelay(
      {
        type: 'tool_call',
        toolCalls,
        ...(input.content ? { content: input.content } : {}),
      },
      input.delayMs,
    );
    return respond(request.params.id, action);
  });

  app.post<{ Params: { id: string } }>('/api/interactions/:id/tool-result', async (request) => {
    const input = parseBody(toolResultActionSchema, request.body);
    return respond(request.params.id, {
      type: 'tool_result',
      tool: input.tool,
      // useToolConfig 时不带 result，让 expandAction 去读 Tool 的 mock 配置。
      ...(input.useToolConfig ? {} : { result: input.result ?? null }),
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    });
  });

  app.post<{ Params: { id: string } }>('/api/interactions/:id/error', async (request) => {
    const input = parseBody(errorActionSchema, request.body);
    return respond(request.params.id, {
      type: 'error',
      status: input.status,
      message: input.message,
      ...(input.errorType ? { errorType: input.errorType } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
    });
  });

  app.post<{ Params: { id: string } }>('/api/interactions/:id/timeout', async (request) =>
    respond(request.params.id, { type: 'timeout' }),
  );

  /** 将当前人工请求转发到项目配置的 OpenAI 兼容上游，并把结果转换为 MockAction。 */
  app.post<{ Params: { id: string } }>('/api/interactions/:id/upstream', async (request) => {
    const input = parseBody(upstreamActionSchema, request.body);
    const interaction = findInteractionRow(request.params.id);
    if (!interaction) throw badRequest('Interaction 不存在');
    const project = findProject(interaction.projectId);
    const settings = project?.settings;
    const selected = settings ? resolveUpstream(settings, input.upstreamId) : null;
    if (!selected) {
      throw badRequest('尚未启用上游 AI API，请先在项目设置中配置');
    }
    const action = await forwardToUpstream({
      request: interaction.request,
      originalModel: interaction.model,
      ...(input.model ? { model: input.model } : {}),
      settings: { ...settings!, upstreamBaseUrl: selected.baseUrl, upstreamApiKey: selected.apiKey, upstreamModel: selected.model },
    });
    return respond(request.params.id, action);
  });

  /** 通用入口：直接投递任意 MockAction（含 sequence 组合）。 */
  app.post<{ Params: { id: string } }>('/api/interactions/:id/action', async (request) => {
    const input = parseBody(genericActionSchema, request.body);
    return respond(request.params.id, input.action);
  });
}

function withDelay(action: MockAction, delayMs?: number): MockAction {
  if (!delayMs || delayMs <= 0) return action;
  return { type: 'sequence', actions: [{ type: 'delay', ms: delayMs }, action] };
}

function respond(interactionId: string, action: MockAction) {
  const result = applyManualAction(interactionId, action);
  return {
    ok: true,
    terminal: result.terminal,
    events: result.events,
    interaction: requireInteraction(interactionId),
  };
}
