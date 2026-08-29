import type {
  ErrorActionInput,
  Interaction,
  MockAction,
  MockEvent,
  ReplyActionInput,
  ThinkActionInput,
  ToolCallActionInput,
  ToolResultActionInput,
  UpstreamActionInput,
} from '@agent-mock/shared';
import { get, post } from './client';

export interface ManualActionResult {
  ok: boolean;
  terminal: boolean;
  events: MockEvent[];
  interaction: Interaction;
}

export const interactionApi = {
  get: (interactionId: string) => get<Interaction>(`/interactions/${interactionId}`),
  reply: (interactionId: string, input: ReplyActionInput) =>
    post<ManualActionResult>(`/interactions/${interactionId}/reply`, input),
  think: (interactionId: string, input: ThinkActionInput) =>
    post<ManualActionResult>(`/interactions/${interactionId}/think`, input),
  toolCall: (interactionId: string, input: ToolCallActionInput) =>
    post<ManualActionResult>(`/interactions/${interactionId}/tool-call`, input),
  toolResult: (interactionId: string, input: ToolResultActionInput) =>
    post<ManualActionResult>(`/interactions/${interactionId}/tool-result`, input),
  error: (interactionId: string, input: ErrorActionInput) =>
    post<ManualActionResult>(`/interactions/${interactionId}/error`, input),
  timeout: (interactionId: string) =>
    post<ManualActionResult>(`/interactions/${interactionId}/timeout`),
  upstream: (interactionId: string, input?: UpstreamActionInput) =>
    post<ManualActionResult>(`/interactions/${interactionId}/upstream`, input ?? {}),
  action: (interactionId: string, action: MockAction) =>
    post<ManualActionResult>(`/interactions/${interactionId}/action`, { action }),
};
