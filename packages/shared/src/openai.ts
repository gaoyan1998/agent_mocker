import { z } from 'zod';

/**
 * OpenAI Chat Completions 兼容层。
 *
 * 原则：优先兼容 OpenAI，不自造 AI 协议。
 * 所有 schema 都是 `passthrough`，未知字段原样保留 —— Agent 框架
 * （LangChain / LangGraph / OpenAI SDK）经常携带额外参数，Mock Server
 * 不应该因为不认识某个字段就报错。
 */

export const FINISH_REASONS = ['stop', 'length', 'tool_calls', 'content_filter'] as const;
export type FinishReason = (typeof FINISH_REASONS)[number];

export const openAiToolCallSchema = z
  .object({
    id: z.string(),
    type: z.literal('function').default('function'),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })
  .passthrough();

export type OpenAiToolCall = z.infer<typeof openAiToolCallSchema>;

export const chatMessageSchema = z
  .object({
    role: z.string(),
    content: z.unknown().optional(),
    name: z.string().optional(),
    tool_calls: z.array(openAiToolCallSchema).optional(),
    tool_call_id: z.string().optional(),
    reasoning_content: z.string().optional(),
  })
  .passthrough();

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatToolSchema = z
  .object({
    type: z.string().default('function'),
    function: z
      .object({
        name: z.string(),
        description: z.string().optional(),
        parameters: z.unknown().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type ChatTool = z.infer<typeof chatToolSchema>;

export const chatCompletionRequestSchema = z
  .object({
    model: z.string().default('mock-gpt'),
    messages: z.array(chatMessageSchema).min(1, 'messages must not be empty'),
    stream: z.boolean().optional(),
    stream_options: z
      .object({ include_usage: z.boolean().optional() })
      .passthrough()
      .optional(),
    tools: z.array(chatToolSchema).optional(),
    functions: z.array(z.unknown()).optional(),
    tool_choice: z.unknown().optional(),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    max_tokens: z.number().optional(),
    max_completion_tokens: z.number().optional(),
    n: z.number().optional(),
    stop: z.unknown().optional(),
    user: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionMessage {
  role: 'assistant';
  content: string | null;
  reasoning_content?: string;
  tool_calls?: OpenAiToolCall[];
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  system_fingerprint?: string;
  choices: Array<{
    index: number;
    message: ChatCompletionMessage;
    logprobs: null;
    finish_reason: FinishReason;
  }>;
  usage: ChatCompletionUsage;
}

export interface ChatCompletionChunkDelta {
  role?: 'assistant';
  content?: string | null;
  reasoning_content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: 'function';
    function?: { name?: string; arguments?: string };
  }>;
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  system_fingerprint?: string;
  choices: Array<{
    index: number;
    delta: ChatCompletionChunkDelta;
    logprobs: null;
    finish_reason: FinishReason | null;
  }>;
  usage?: ChatCompletionUsage | null;
}

/** OpenAI 风格错误体。 */
export interface OpenAiErrorBody {
  error: {
    message: string;
    type: string;
    code: string | null;
    param: string | null;
  };
}

export function openAiError(
  message: string,
  type = 'invalid_request_error',
  code: string | null = null,
  param: string | null = null,
): OpenAiErrorBody {
  return { error: { message, type, code, param } };
}
