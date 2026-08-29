import type { FastifyInstance } from 'fastify';
import { registerChatCompletions } from './chat-completions.js';
import { registerMockExtras } from './extras.js';

/** Mock API（/v1/*）—— 给 Agent 用，与管理 API 完全分离。 */
export async function registerMockApi(app: FastifyInstance): Promise<void> {
  await registerChatCompletions(app);
  await registerMockExtras(app);
}
