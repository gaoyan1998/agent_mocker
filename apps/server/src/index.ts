import { buildApp } from './app.js';
import { config } from './config.js';
import { pendingRegistry } from './engine/pending-registry.js';
import { closeDatabase } from './db/index.js';
import { abortDanglingInteractions } from './repositories/interactions.js';
import { seedDemoProjectIfEmpty } from './services/seed.js';

async function main(): Promise<void> {
  // 上次进程退出时挂起的请求，其 HTTP 连接早已断开，直接标记 aborted。
  const aborted = abortDanglingInteractions();
  const seededProjectId = seedDemoProjectIfEmpty();

  const app = await buildApp();
  if (aborted > 0) app.log.info(`已清理 ${aborted} 条上次遗留的挂起请求`);
  if (seededProjectId) app.log.info(`已创建示例项目 ${seededProjectId}（API Key: sk-mock-demo）`);

  await app.listen({ host: config.host, port: config.port });
  app.log.info(`管理 API:  http://localhost:${config.port}/api`);
  app.log.info(`Mock API:  http://localhost:${config.port}/v1（可拼接 /<sessionId> 绑定会话）  ← Agent 的 base_url`);
  app.log.info(`数据库:    ${config.databasePath}`);

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info(`收到 ${signal}，正在关闭…`);
    pendingRegistry.drain();
    await app.close();
    closeDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('启动失败:', error);
  process.exit(1);
});
