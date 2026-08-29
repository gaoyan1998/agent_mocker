import type { ChatCompletionRequest, MockAction, ProjectSettings, UpstreamConfig } from '@agent-mock/shared';
import { badGateway, conflict } from '../lib/errors.js';

interface ForwardToUpstreamInput {
  request: ChatCompletionRequest;
  originalModel: string;
  model?: string;
  settings: ProjectSettings;
}

export interface UpstreamModelInfo {
  id: string;
  name?: string;
}

export function resolveUpstream(settings: ProjectSettings, upstreamId?: string): UpstreamConfig | null {
  const configured = settings.upstreams.filter((item) => item.enabled);
  const legacy = settings.upstreamEnabled && settings.upstreamBaseUrl.trim()
    ? { id: 'legacy', name: '默认上游', enabled: true, baseUrl: settings.upstreamBaseUrl, apiKey: settings.upstreamApiKey, model: settings.upstreamModel }
    : null;
  return upstreamId
    ? configured.find((item) => item.id === upstreamId) ?? (upstreamId === 'legacy' ? legacy : null)
    : configured[0] ?? legacy;
}

export async function fetchUpstreamModels(baseUrl: string, apiKey: string): Promise<UpstreamModelInfo[]> {
  const base = baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {};
  if (apiKey.trim()) headers.authorization = `Bearer ${apiKey.trim()}`;
  let response: Response;
  try {
    response = await fetch(`${base}/models`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw badGateway(error instanceof Error ? `无法连接上游 AI：${error.message}` : '无法连接上游 AI');
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = payload.error as Record<string, unknown> | undefined;
    throw badGateway(`上游模型列表返回 ${response.status}: ${String(error?.message ?? payload.message ?? response.statusText)}`, payload);
  }
  const data = Array.isArray(payload.data) ? payload.data : [];
  return data.flatMap((item) => {
    if (typeof item === 'string') return [{ id: item }];
    if (!item || typeof item !== 'object' || typeof (item as Record<string, unknown>).id !== 'string') return [];
    const model = item as Record<string, unknown>;
    return [{ id: model.id as string, ...(typeof model.name === 'string' ? { name: model.name } : {}) }];
  });
}

/** 调用 OpenAI Chat Completions 兼容上游，并转成现有人工动作。 */
export async function forwardToUpstream(input: ForwardToUpstreamInput): Promise<MockAction> {
  const baseUrl = input.settings.upstreamBaseUrl.replace(/\/+$/, '');
  const model = input.model?.trim() || input.settings.upstreamModel.trim() || input.originalModel;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (input.settings.upstreamApiKey.trim()) {
    headers.authorization = `Bearer ${input.settings.upstreamApiKey.trim()}`;
  }
  const { stream_options: _streamOptions, ...request } = input.request;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...request, model, stream: false }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw badGateway(
      error instanceof Error ? `无法连接上游 AI：${error.message}` : '无法连接上游 AI',
    );
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = payload.error as Record<string, unknown> | undefined;
    throw badGateway(
      `上游 API 返回 ${response.status}: ${String(error?.message ?? payload.message ?? response.statusText)}`,
      payload,
    );
  }

  const choice = Array.isArray(payload.choices)
    ? (payload.choices[0] as Record<string, unknown> | undefined)
    : undefined;
  const message = (choice?.message ?? {}) as Record<string, unknown>;
  const content = typeof message.content === 'string' ? message.content : '';
  const reasoning =
    typeof message.reasoning_content === 'string'
      ? message.reasoning_content
      : typeof message.reasoning === 'string'
        ? message.reasoning
        : '';
  const rawToolCalls = Array.isArray(message.tool_calls)
    ? (message.tool_calls as Array<Record<string, unknown>>)
    : [];
  const toolCalls = rawToolCalls.flatMap((call) => {
    const fn = (call.function ?? {}) as Record<string, unknown>;
    const name = typeof fn.name === 'string' ? fn.name : '';
    if (!name) return [];
    return [{
      ...(typeof call.id === 'string' ? { id: call.id } : {}),
      name,
      arguments:
        typeof fn.arguments === 'string'
          ? fn.arguments
          : (fn.arguments as Record<string, unknown> | undefined),
    }];
  });

  if (!content && !reasoning && toolCalls.length === 0) {
    throw conflict('上游 AI 没有返回 content、reasoning_content 或 tool_calls，请求仍保持等待');
  }

  const terminalAction: MockAction =
    toolCalls.length > 0
      ? { type: 'tool_call', toolCalls, ...(content ? { content } : {}) }
      : { type: 'assistant', content };
  return reasoning
    ? { type: 'sequence', actions: [{ type: 'think', content: reasoning }, terminalAction] }
    : terminalAction;
}
