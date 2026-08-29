import type {
  ChatCompletionChunk,
  ChatCompletionMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionUsage,
  FinishReason,
  MockEvent,
  ResolvedToolCall,
  ThinkMode,
} from '@agent-mock/shared';
import { estimateTokens, messageContentToText } from '../lib/text.js';

export interface ResponseIdentity {
  id: string;
  model: string;
  created: number;
}

/** 把事件序列聚合成 OpenAI 的一次完整回复。 */
export function aggregateEvents(events: MockEvent[]): {
  think: string;
  content: string;
  toolCalls: ResolvedToolCall[];
  finishReason: FinishReason;
} {
  let think = '';
  let content = '';
  const toolCalls: ResolvedToolCall[] = [];
  let explicitFinish: FinishReason | null = null;

  for (const event of events) {
    switch (event.type) {
      case 'think':
        think += event.content;
        break;
      case 'assistant':
        content += event.content;
        if (event.finishReason) explicitFinish = event.finishReason;
        break;
      case 'tool_call':
        if (event.content) content += event.content;
        toolCalls.push(...event.toolCalls);
        break;
      default:
        break;
    }
  }

  const finishReason: FinishReason =
    toolCalls.length > 0 ? 'tool_calls' : (explicitFinish ?? 'stop');
  return { think, content, toolCalls, finishReason };
}

export function estimatePromptTokens(request: ChatCompletionRequest): number {
  return (request.messages ?? []).reduce(
    (total, message) =>
      total + estimateTokens(messageContentToText(message.content)) + estimateTokens(message.role),
    0,
  );
}

export function buildUsage(promptTokens: number, completionText: string): ChatCompletionUsage {
  const completionTokens = estimateTokens(completionText);
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

/** thinkMode 决定 think 内容放在 reasoning_content、`<think>` 标签、还是两者都放。 */
export function applyThinkMode(
  content: string,
  think: string,
  thinkMode: ThinkMode,
): { content: string; reasoningContent?: string } {
  if (!think) return { content };
  const tagged = `<think>${think}</think>${content ? `\n${content}` : ''}`;
  switch (thinkMode) {
    case 'content_tag':
      return { content: tagged };
    case 'both':
      return { content: tagged, reasoningContent: think };
    case 'reasoning_content':
    default:
      return { content, reasoningContent: think };
  }
}

export function buildChatCompletion(
  events: MockEvent[],
  identity: ResponseIdentity,
  options: { thinkMode: ThinkMode; promptTokens: number },
): ChatCompletionResponse {
  const aggregated = aggregateEvents(events);
  const { content, reasoningContent } = applyThinkMode(
    aggregated.content,
    aggregated.think,
    options.thinkMode,
  );

  const message: ChatCompletionMessage = {
    role: 'assistant',
    content: content === '' && aggregated.toolCalls.length > 0 ? null : content,
  };
  if (reasoningContent) message.reasoning_content = reasoningContent;
  if (aggregated.toolCalls.length > 0) {
    message.tool_calls = aggregated.toolCalls.map((call) => ({
      id: call.id,
      type: 'function' as const,
      function: { name: call.name, arguments: call.arguments },
    }));
  }

  return {
    id: identity.id,
    object: 'chat.completion',
    created: identity.created,
    model: identity.model,
    system_fingerprint: 'fp_agent_mock',
    choices: [
      {
        index: 0,
        message,
        logprobs: null,
        finish_reason: aggregated.finishReason,
      },
    ],
    usage: buildUsage(
      options.promptTokens,
      `${aggregated.think}${aggregated.content}${aggregated.toolCalls
        .map((call) => call.arguments)
        .join('')}`,
    ),
  };
}

// ------------------------------------------------------------- 流式 chunk 工厂

function baseChunk(identity: ResponseIdentity): ChatCompletionChunk {
  return {
    id: identity.id,
    object: 'chat.completion.chunk',
    created: identity.created,
    model: identity.model,
    system_fingerprint: 'fp_agent_mock',
    choices: [{ index: 0, delta: {}, logprobs: null, finish_reason: null }],
  };
}

export function roleChunk(identity: ResponseIdentity): ChatCompletionChunk {
  const chunk = baseChunk(identity);
  chunk.choices[0]!.delta = { role: 'assistant', content: '' };
  return chunk;
}

export function contentChunk(identity: ResponseIdentity, content: string): ChatCompletionChunk {
  const chunk = baseChunk(identity);
  chunk.choices[0]!.delta = { content };
  return chunk;
}

export function reasoningChunk(identity: ResponseIdentity, content: string): ChatCompletionChunk {
  const chunk = baseChunk(identity);
  chunk.choices[0]!.delta = { reasoning_content: content };
  return chunk;
}

export function toolCallHeaderChunk(
  identity: ResponseIdentity,
  index: number,
  call: ResolvedToolCall,
): ChatCompletionChunk {
  const chunk = baseChunk(identity);
  chunk.choices[0]!.delta = {
    tool_calls: [
      { index, id: call.id, type: 'function', function: { name: call.name, arguments: '' } },
    ],
  };
  return chunk;
}

export function toolCallArgumentsChunk(
  identity: ResponseIdentity,
  index: number,
  argumentsPart: string,
): ChatCompletionChunk {
  const chunk = baseChunk(identity);
  chunk.choices[0]!.delta = {
    tool_calls: [{ index, function: { arguments: argumentsPart } }],
  };
  return chunk;
}

export function finishChunk(
  identity: ResponseIdentity,
  finishReason: FinishReason,
): ChatCompletionChunk {
  const chunk = baseChunk(identity);
  chunk.choices[0]!.finish_reason = finishReason;
  return chunk;
}

export function usageChunk(
  identity: ResponseIdentity,
  usage: ChatCompletionUsage,
): ChatCompletionChunk {
  return {
    id: identity.id,
    object: 'chat.completion.chunk',
    created: identity.created,
    model: identity.model,
    system_fingerprint: 'fp_agent_mock',
    choices: [],
    usage,
  };
}
