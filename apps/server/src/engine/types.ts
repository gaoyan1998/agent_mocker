import type {
  ChatCompletionRequest,
  ChatMessage,
  DebugSession,
  Interaction,
  Project,
} from '@agent-mock/shared';

/** Rule / Scenario 条件求值所需要的、从请求里预先抽取好的事实。 */
export interface RequestFacts {
  model: string;
  messages: ChatMessage[];
  messageCount: number;
  lastUserMessage: string;
  lastMessage: string;
  allMessages: string;
  systemPrompt: string;
  rawRequest: string;
  /** request.tools 中声明的 tool 名 + 历史消息里出现过的 tool 名。 */
  toolNames: string[];
  /** 当前请求是这个 Session 的第几次交互（从 1 开始）。 */
  sequence: number;
}

export interface MockContext {
  project: Project;
  session: DebugSession;
  interaction: Interaction;
  request: ChatCompletionRequest;
  facts: RequestFacts;
}
