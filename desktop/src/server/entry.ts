// 桌面版的服务端入口。
//
// 这里刻意不复用 apps/server/src/index.ts：那个文件会注册 SIGINT/SIGTERM 并调用
// process.exit()，直接跑在 Electron 主进程里会把整个应用杀掉。生命周期改由
// src/main/server.ts 控制，这个模块只负责把服务端拼装起来。
//
// 注意加载时机：apps/server/src/config.ts 在模块求值时就会快照 MOCK_* 环境变量，
// 而 db/index.ts 更是在 import 阶段直接打开 SQLite 文件。所以主进程必须先设置好
// 环境变量，再 require 本 bundle（见 src/main/server.ts）。
import { buildApp } from '../../../apps/server/src/app.js';
import { config } from '../../../apps/server/src/config.js';
import { closeDatabase } from '../../../apps/server/src/db/index.js';
import { pendingRegistry } from '../../../apps/server/src/engine/pending-registry.js';
import { abortDanglingInteractions } from '../../../apps/server/src/repositories/interactions.js';
import { seedDemoProjectIfEmpty } from '../../../apps/server/src/services/seed.js';

/**
 * 从 buildApp 的签名反推，而不是 `import type { FastifyInstance } from 'fastify'`：
 * desktop/ 有自己独立的 node_modules（见 pnpm-workspace.yaml），解析不到 fastify。
 */
export type ServerApp = Awaited<ReturnType<typeof buildApp>>;

export interface CreatedServer {
  app: ServerApp;
  /** 上次退出时残留的挂起请求数量。 */
  abortedInteractions: number;
  /** 首次启动时自动创建的示例项目 id，已有数据时为 null。 */
  seededProjectId: string | null;
}

/**
 * 装配 Fastify 实例，但不监听端口 —— 端口重试逻辑放在主进程里，
 * 这样端口被占用时不需要重新加载整个服务端模块。
 */
export async function createServer(): Promise<CreatedServer> {
  // 打包后 stdout 不是 TTY，但开发模式下从终端启动 Electron 时是。
  // app.ts 会据此启用 pino-pretty transport，而 transport 依赖运行时
  // require.resolve('pino-pretty')，在 bundle 里解析不到会导致启动失败。
  // 桌面版统一走无 transport 的普通日志。
  if (process.stdout && process.stdout.isTTY) {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
  }

  // 上次进程退出时挂起的请求，其 HTTP 连接早已断开，直接标记 aborted。
  const abortedInteractions = abortDanglingInteractions();
  const seededProjectId = seedDemoProjectIfEmpty();
  const app = await buildApp();

  return { app, abortedInteractions, seededProjectId };
}

/** 关闭 Fastify，但保留 SQLite 句柄 —— 重启服务时复用同一个数据库连接。 */
export async function stopServer(app: ServerApp | null): Promise<void> {
  pendingRegistry.drain();
  if (app) await app.close();
}

/** 退出应用前调用：先停服务，再释放 SQLite。 */
export async function shutdownServer(app: ServerApp | null): Promise<void> {
  await stopServer(app);
  closeDatabase();
}

export { config };
