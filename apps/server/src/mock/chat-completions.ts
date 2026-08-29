import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerResponse } from 'node:http';
import {
  chatCompletionRequestSchema,
  openAiError,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
  type DebugSession,
  type Interaction,
  type MockErrorSpec,
  type MockEvent,
  type Project,
} from '@agent-mock/shared';
import { decide } from '../engine/mock-engine.js';
import { pendingRegistry, type PendingEntry } from '../engine/pending-registry.js';
import {
  aggregateEvents,
  buildChatCompletion,
  buildUsage,
  contentChunk,
  estimatePromptTokens,
  finishChunk,
  reasoningChunk,
  roleChunk,
  toolCallArgumentsChunk,
  toolCallHeaderChunk,
  usageChunk,
  type ResponseIdentity,
} from '../engine/response-builder.js';
import { buildFacts } from '../engine/rule-engine.js';
import { newChatCompletionId } from '../lib/id.js';
import { chunkString, messageContentToText, sleep, tryParseJson } from '../lib/text.js';
import { publish } from '../lib/events.js';
import {
  createInteraction,
  findPreviousInteraction,
  nextInteractionSequence,
  updateInteraction,
} from '../repositories/interactions.js';
import { bumpSession } from '../repositories/sessions.js';
import { writeLog } from '../repositories/logs.js';
import { HttpError } from '../lib/errors.js';
import {
  completeInteraction,
  failInteraction,
  recordEvent,
  recordMockEvent,
  setInteractionStatus,
} from '../services/interaction-runtime.js';
import { resolveProject, resolveSession } from '../services/session-resolver.js';

/**
 * Mock OpenAI API。
 *
 * 这一层只做三件事：解析请求 → 交给 MockEngine 拿 Decision → 按 Decision 发响应。
 * 不出现任何 `if (rule) ... else if (scenario) ...`。
 */
export async function registerChatCompletions(app: FastifyInstance): Promise<void> {
  app.post('/v1/chat/completions', async (request, reply) => handleChatCompletion(request, reply));
  app.post<{ Params: { sessionId: string } }>(
    '/:sessionId/v1/chat/completions',
    async (request, reply) => handleChatCompletion(request, reply),
  );
}

interface RequestContext {
  project: Project;
  session: DebugSession;
  interaction: Interaction;
  body: ChatCompletionRequest;
  identity: ResponseIdentity;
  stream: boolean;
  startedAt: number;
  includeUsage: boolean;
}

async function handleChatCompletion(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  const startedAt = Date.now();
  const headers = request.headers as Record<string, unknown>;

  const project = resolveProject(headers);
  if (!project) {
    const body = openAiError(
      '无效的 API Key。请在 Mock Server 的项目设置里查看 api_key，或设置 MOCK_STRICT_API_KEY=false。',
      'invalid_request_error',
      'invalid_api_key',
    );
    logRequest(request, null, null, null, 401, startedAt, body);
    return reply.code(401).send(body);
  }

  const parsed = chatCompletionRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    const body = openAiError(
      `请求体校验失败：${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'} ${issue.message}`).join('; ')}`,
      'invalid_request_error',
      'invalid_payload',
    );
    logRequest(request, project.id, null, null, 400, startedAt, body);
    return reply.code(400).send(body);
  }

  const body = parsed.data;
  const stream = body.stream === true;
  const urlSessionId = (request.params as { sessionId?: string }).sessionId;
  const { session } = resolveSession(project, headers, urlSessionId);

  const sequence = nextInteractionSequence(session.id);
  const interaction = createInteraction({
    projectId: project.id,
    sessionId: session.id,
    sequence,
    status: 'pending',
    mode: 'pending',
    stream,
    model: body.model || project.settings.defaultModel,
    request: body,
    requestHeaders: sanitizeHeaders(headers),
  });
  bumpSession(session.id, sequence);
  publish({
    type: 'interaction.created',
    projectId: project.id,
    sessionId: session.id,
    interactionId: interaction.id,
    interaction,
  });

  recordRequestEvents(interaction, body, session.id);

  const identity: ResponseIdentity = {
    id: newChatCompletionId(),
    model: body.model || project.settings.defaultModel,
    created: Math.floor(Date.now() / 1000),
  };
  const ctx: RequestContext = {
    project,
    session,
    interaction,
    body,
    identity,
    stream,
    startedAt,
    includeUsage: body.stream_options?.include_usage === true,
  };

  let decision: Awaited<ReturnType<typeof decide>>;
  try {
    decision = await decide({
      project,
      session,
      interaction,
      request: body,
      facts: buildFacts(body, sequence),
    });
  } catch (error) {
    const upstreamError = error instanceof HttpError
      ? { status: error.status, message: error.message, errorType: 'upstream_error', code: error.code }
      : { status: 500, message: error instanceof Error ? error.message : 'Mock 决策失败', errorType: 'server_error', code: 'decision_error' };
    return respondWithError(request, reply, ctx, upstreamError);
  }

  recordEvent(interaction, 'decision', {
    mode: decision.meta.mode,
    reason: decision.meta.reason,
    ...(decision.meta.ruleId ? { ruleId: decision.meta.ruleId } : {}),
    ...(decision.meta.ruleName ? { ruleName: decision.meta.ruleName } : {}),
    ...(decision.meta.scenarioId ? { scenarioId: decision.meta.scenarioId } : {}),
    ...(decision.meta.scenarioName ? { scenarioName: decision.meta.scenarioName } : {}),
    decision: decision.type,
  });
  updateInteraction(interaction.id, {
    mode: decision.meta.mode,
    ruleId: decision.meta.ruleId ?? null,
    scenarioId: decision.meta.scenarioId ?? null,
  });

  switch (decision.type) {
    case 'error':
      return respondWithError(request, reply, ctx, decision.error);

    case 'response':
      return respondJson(request, reply, ctx, toAsyncIterable(decision.events), true);

    case 'stream':
      return respondStream(request, reply, ctx, toAsyncIterable(decision.events), true);

    case 'pending':
      return respondPending(request, reply, ctx, decision.events);

    default:
      return respondWithError(request, reply, ctx, {
        status: 500,
        message: 'Mock Engine 返回了无法识别的 Decision',
        errorType: 'server_error',
        code: null,
      });
  }
}

// ------------------------------------------------------------------ 请求事件

function recordRequestEvents(
  interaction: Interaction,
  body: ChatCompletionRequest,
  sessionId: string,
): void {
  const previous = findPreviousInteraction(sessionId, interaction.sequence);
  const previousCount = previous?.request?.messages?.length ?? 0;
  const messages = body.messages ?? [];
  const delta = previousCount > 0 && previousCount <= messages.length
    ? messages.slice(previousCount)
    : messages;

  recordEvent(interaction, 'request', {
    model: body.model,
    stream: body.stream === true,
    messageCount: messages.length,
    newMessageCount: delta.length,
    newMessages: delta,
    tools: (body.tools ?? [])
      .map((tool) => tool.function?.name)
      .filter((name): name is string => Boolean(name)),
  });

  // Agent 把上一轮 Tool 的执行结果回传时，把它单独记成 tool_result 事件，
  // 这样时间线上 tool_call → tool_result 才是连续的。
  for (const message of delta) {
    if (message.role !== 'tool') continue;
    recordEvent(interaction, 'tool_result', {
      tool: message.name ?? '(unknown)',
      toolCallId: message.tool_call_id ?? null,
      result: tryParseJson(messageContentToText(message.content)),
      source: 'agent',
    });
  }
}

// ---------------------------------------------------------------------- 响应

async function* toAsyncIterable(events: MockEvent[]): AsyncGenerator<MockEvent> {
  for (const event of events) yield event;
}

function respondWithError(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: RequestContext,
  error: MockErrorSpec,
): FastifyReply {
  recordMockEvent(ctx.interaction, { type: 'error', ...error });
  failInteraction(
    ctx.interaction.id,
    error,
    Date.now() - ctx.startedAt,
    error.status === 408 ? 'timeout' : 'error',
  );
  const body = openAiError(error.message, error.errorType, error.code);
  logRequest(
    request,
    ctx.project.id,
    ctx.session.id,
    ctx.interaction.id,
    error.status,
    ctx.startedAt,
    body,
  );
  return reply.code(error.status).send(body);
}

/** 非流式：把事件全部消费完，聚合成一次 chat.completion。 */
async function respondJson(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: RequestContext,
  events: AsyncIterable<MockEvent>,
  record: boolean,
): Promise<FastifyReply> {
  const collected: MockEvent[] = [];
  let errorEvent: MockErrorSpec | null = null;

  for await (const event of events) {
    if (event.type === 'delay') {
      if (record) recordMockEvent(ctx.interaction, event);
      await sleep(event.ms);
      continue;
    }
    if (record) recordMockEvent(ctx.interaction, event);
    if (event.type === 'error') {
      errorEvent = {
        status: event.status,
        message: event.message,
        errorType: event.errorType,
        code: event.code,
      };
      break;
    }
    collected.push(event);
  }

  if (errorEvent) {
    failInteraction(
      ctx.interaction.id,
      errorEvent,
      Date.now() - ctx.startedAt,
      errorEvent.status === 408 ? 'timeout' : 'error',
    );
    const body = openAiError(errorEvent.message, errorEvent.errorType, errorEvent.code);
    logRequest(
      request,
      ctx.project.id,
      ctx.session.id,
      ctx.interaction.id,
      errorEvent.status,
      ctx.startedAt,
      body,
    );
    return reply.code(errorEvent.status).send(body);
  }

  const response: ChatCompletionResponse = buildChatCompletion(collected, ctx.identity, {
    thinkMode: ctx.project.settings.thinkMode,
    promptTokens: estimatePromptTokens(ctx.body),
  });
  completeInteraction(ctx.interaction.id, response, Date.now() - ctx.startedAt);
  logRequest(
    request,
    ctx.project.id,
    ctx.session.id,
    ctx.interaction.id,
    200,
    ctx.startedAt,
    response,
  );
  return reply.code(200).send(response);
}

/** 流式：SSE 边产生边发。 */
async function respondStream(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: RequestContext,
  events: AsyncIterable<MockEvent>,
  record: boolean,
  entry?: PendingEntry,
): Promise<void> {
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let aborted = false;
  const onClose = () => {
    aborted = true;
    entry?.finish([], 'aborted');
  };
  raw.on('close', onClose);

  const settings = ctx.project.settings;
  const collected: MockEvent[] = [];
  let errorEvent: MockErrorSpec | null = null;
  let toolCallIndex = 0;

  write(raw, roleChunk(ctx.identity));

  try {
    for await (const event of events) {
      if (aborted) break;
      if (record) recordMockEvent(ctx.interaction, event);

      switch (event.type) {
        case 'delay':
          await sleep(event.ms);
          break;

        case 'think': {
          collected.push(event);
          const pieces = chunkString(event.content, settings.streamChunkSize);
          const useReasoning = settings.thinkMode !== 'content_tag';
          const useTag = settings.thinkMode !== 'reasoning_content';
          if (useTag) write(raw, contentChunk(ctx.identity, '<think>'));
          for (const piece of pieces) {
            if (aborted) break;
            if (useReasoning) write(raw, reasoningChunk(ctx.identity, piece));
            if (useTag) write(raw, contentChunk(ctx.identity, piece));
            await sleep(settings.streamChunkIntervalMs);
          }
          if (useTag) write(raw, contentChunk(ctx.identity, '</think>\n'));
          break;
        }

        case 'assistant': {
          collected.push(event);
          for (const piece of chunkString(event.content, settings.streamChunkSize)) {
            if (aborted) break;
            write(raw, contentChunk(ctx.identity, piece));
            await sleep(settings.streamChunkIntervalMs);
          }
          break;
        }

        case 'tool_call': {
          collected.push(event);
          if (event.content) {
            for (const piece of chunkString(event.content, settings.streamChunkSize)) {
              write(raw, contentChunk(ctx.identity, piece));
              await sleep(settings.streamChunkIntervalMs);
            }
          }
          for (const call of event.toolCalls) {
            const index = toolCallIndex;
            toolCallIndex += 1;
            write(raw, toolCallHeaderChunk(ctx.identity, index, call));
            for (const piece of chunkString(call.arguments, Math.max(8, settings.streamChunkSize))) {
              if (aborted) break;
              write(raw, toolCallArgumentsChunk(ctx.identity, index, piece));
              await sleep(settings.streamChunkIntervalMs);
            }
          }
          break;
        }

        case 'tool_result':
          // Tool Result 只进时间线，不进 OpenAI 响应流。
          collected.push(event);
          break;

        case 'error':
          errorEvent = {
            status: event.status,
            message: event.message,
            errorType: event.errorType,
            code: event.code,
          };
          break;

        default:
          break;
      }

      if (errorEvent) break;
    }
  } catch (error) {
    errorEvent = {
      status: 500,
      message: error instanceof Error ? error.message : '流式响应发生未知错误',
      errorType: 'server_error',
      code: null,
    };
  }

  raw.off('close', onClose);

  if (aborted) {
    setInteractionStatus(ctx.interaction.id, 'aborted');
    logRequest(request, ctx.project.id, ctx.session.id, ctx.interaction.id, 499, ctx.startedAt, {
      aborted: true,
    });
    raw.end();
    return;
  }

  if (errorEvent) {
    // 头已经发出去了，无法再改状态码：按 OpenAI 的做法在流里塞一个 error 事件。
    writeRaw(raw, `data: ${JSON.stringify(openAiError(errorEvent.message, errorEvent.errorType, errorEvent.code))}\n\n`);
    writeRaw(raw, 'data: [DONE]\n\n');
    raw.end();
    failInteraction(
      ctx.interaction.id,
      errorEvent,
      Date.now() - ctx.startedAt,
      errorEvent.status === 408 ? 'timeout' : 'error',
    );
    logRequest(
      request,
      ctx.project.id,
      ctx.session.id,
      ctx.interaction.id,
      errorEvent.status,
      ctx.startedAt,
      { stream: true, error: errorEvent },
    );
    return;
  }

  const aggregated = aggregateEvents(collected);
  write(raw, finishChunk(ctx.identity, aggregated.finishReason));

  const promptTokens = estimatePromptTokens(ctx.body);
  const usage = buildUsage(
    promptTokens,
    `${aggregated.think}${aggregated.content}${aggregated.toolCalls.map((call) => call.arguments).join('')}`,
  );
  if (ctx.includeUsage) write(raw, usageChunk(ctx.identity, usage));
  writeRaw(raw, 'data: [DONE]\n\n');
  raw.end();

  const response = buildChatCompletion(collected, ctx.identity, {
    thinkMode: ctx.project.settings.thinkMode,
    promptTokens,
  });
  completeInteraction(ctx.interaction.id, response, Date.now() - ctx.startedAt);
  logRequest(request, ctx.project.id, ctx.session.id, ctx.interaction.id, 200, ctx.startedAt, {
    stream: true,
    response,
  });
}

/** Manual Mode：挂起 HTTP 请求，等 UI 推事件。 */
async function respondPending(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: RequestContext,
  preEvents: MockEvent[],
): Promise<unknown> {
  const entry = pendingRegistry.register({
    interactionId: ctx.interaction.id,
    projectId: ctx.project.id,
    sessionId: ctx.session.id,
    stream: ctx.stream,
    timeoutMs: ctx.project.settings.manualTimeoutMs,
    onTimeout: (pending) => {
      const timeoutError: MockEvent = {
        type: 'error',
        status: 408,
        message: `等待人工回复超时（${Math.round(ctx.project.settings.manualTimeoutMs / 1000)}s）`,
        errorType: 'timeout_error',
        code: 'manual_timeout',
      };
      recordMockEvent(ctx.interaction, timeoutError);
      pending.finish([timeoutError], 'timeout');
    },
  });

  setInteractionStatus(ctx.interaction.id, 'waiting', 'manual');

  // Rule/Scenario 里 manual 之前的事件先播放（例如先自动 Think，再等人工决定回复）。
  for (const event of preEvents) {
    recordMockEvent(ctx.interaction, event);
  }
  entry.push(...preEvents);

  if (ctx.stream) {
    await respondStream(request, reply, ctx, entry.consume(), false, entry);
    return reply;
  }

  // 非流式：Agent 的 HTTP 请求就这么挂着，直到人工给出终结事件。
  // 注意监听的是 reply.raw（ServerResponse）而不是 request.raw：后者在请求体读完时
  // 就会触发 'close'，会把每个挂起请求立刻放行。
  const onClose = () => {
    if (!reply.raw.writableEnded) entry.finish([], 'aborted');
  };
  reply.raw.on('close', onClose);
  try {
    return await respondJson(request, reply, ctx, entry.consume(), false);
  } finally {
    reply.raw.off('close', onClose);
    if (entry.closeReason === 'aborted') {
      setInteractionStatus(ctx.interaction.id, 'aborted');
    }
  }
}

// ---------------------------------------------------------------------- 工具

function write(raw: ServerResponse, payload: unknown): void {
  writeRaw(raw, `data: ${JSON.stringify(payload)}\n\n`);
}

function writeRaw(raw: ServerResponse, text: string): void {
  if (!raw.writableEnded) raw.write(text);
}

const SENSITIVE_HEADERS = new Set(['authorization', 'api-key', 'x-api-key', 'cookie']);

export function sanitizeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const text = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    out[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? maskSecret(text) : text;
  }
  return out;
}

function maskSecret(value: string): string {
  const trimmed = value.replace(/^Bearer\s+/i, '');
  if (trimmed.length <= 8) return '***';
  return `${trimmed.slice(0, 6)}***${trimmed.slice(-4)}`;
}

function logRequest(
  request: FastifyRequest,
  projectId: string | null,
  sessionId: string | null,
  interactionId: string | null,
  status: number,
  startedAt: number,
  responseBody: unknown,
): void {
  writeLog({
    projectId,
    sessionId,
    interactionId,
    method: request.method,
    path: request.url,
    status,
    durationMs: Date.now() - startedAt,
    requestHeaders: sanitizeHeaders(request.headers as Record<string, unknown>),
    requestBody: request.body ?? null,
    responseBody,
    ip: request.ip,
  });
}
