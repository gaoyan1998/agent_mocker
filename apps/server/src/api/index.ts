import type { FastifyInstance } from 'fastify';
import { registerConfigRoutes } from './config.js';
import { registerEventRoutes } from './events.js';
import { registerInteractionRoutes } from './interactions.js';
import { registerProjectRoutes } from './projects.js';
import { registerSessionRoutes } from './sessions.js';
import { registerSystemRoutes } from './system.js';

/** 管理 API（/api/*）—— 给 Web UI 用。 */
export async function registerManagementApi(app: FastifyInstance): Promise<void> {
  await registerSystemRoutes(app);
  await registerProjectRoutes(app);
  await registerSessionRoutes(app);
  await registerInteractionRoutes(app);
  await registerConfigRoutes(app);
  await registerEventRoutes(app);
}
