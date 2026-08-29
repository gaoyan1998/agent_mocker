import fs from 'node:fs';
import net from 'node:net';
// 不直接 `import type { FastifyInstance } from 'fastify'`：desktop/ 有自己独立的
// node_modules，解析不到 fastify（见 ../server/entry.ts 的说明）。
import type { CreatedServer, ServerApp } from '../server/entry.js';
import { log } from './logger.js';
import { databasePath, dataDir, serverBundlePath, webDistDir } from './paths.js';
import { loadSettings } from './settings.js';

interface ServerModule {
  createServer(): Promise<CreatedServer>;
  stopServer(app: ServerApp | null): Promise<void>;
  shutdownServer(app: ServerApp | null): Promise<void>;
}

export interface ServerInfo {
  host: string;
  port: number;
  /** 浏览器 / 窗口可直接访问的地址，0.0.0.0 会被换成 127.0.0.1。 */
  url: string;
  /** 端口被占用而顺延时，这里是原本想用的端口。 */
  requestedPort: number | null;
}

let serverModule: ServerModule | null = null;
let instance: ServerApp | null = null;
let current: ServerInfo | null = null;

export function serverInfo(): ServerInfo | null {
  return current;
}

/**
 * 加载服务端 bundle。
 *
 * apps/server/src/config.ts 在模块求值时就会快照 MOCK_* 环境变量，db/index.ts 更是在
 * import 阶段直接打开 SQLite，所以这里必须先写好环境变量再 require，而且整个进程
 * 只能 require 一次（重启服务时复用同一个模块和数据库连接）。
 */
function loadServerModule(): ServerModule {
  if (serverModule) return serverModule;

  const settings = loadSettings();
  fs.mkdirSync(dataDir(), { recursive: true });

  process.env.MOCK_HOST = settings.host;
  process.env.MOCK_PORT = String(settings.port);
  process.env.MOCK_DB_PATH = databasePath();
  process.env.MOCK_WEB_DIST = webDistDir();
  process.env.MOCK_STRICT_API_KEY = settings.strictApiKey ? 'true' : 'false';
  process.env.MOCK_LOG_LEVEL = settings.logLevel;

  const bundle = serverBundlePath();
  log.info('加载服务端 bundle', bundle);
  // 运行时路径，不能让 esbuild 把它 bundle 进来。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  serverModule = require(bundle) as ServerModule;
  return serverModule;
}

function probePort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, host);
  });
}

/** 优先用配置里的端口，被占用就往后顺延，让 Agent 的 base_url 尽量保持稳定。 */
async function pickPort(host: string, preferred: number): Promise<number> {
  for (let offset = 0; offset < 50; offset += 1) {
    const candidate = preferred + offset;
    if (candidate > 65_535) break;
    if (await probePort(host, candidate)) return candidate;
  }
  throw new Error(`${preferred} 起往后 50 个端口都被占用了`);
}

export async function startServer(): Promise<ServerInfo> {
  if (current) return current;

  const settings = loadSettings();
  const server = loadServerModule();
  const port = await pickPort(settings.host, settings.port);

  const created = await server.createServer();
  instance = created.app;
  await instance.listen({ host: settings.host, port });

  const displayHost =
    settings.host === '0.0.0.0' || settings.host === '::' ? '127.0.0.1' : settings.host;
  current = {
    host: settings.host,
    port,
    url: `http://${displayHost}:${port}`,
    requestedPort: port === settings.port ? null : settings.port,
  };

  if (created.abortedInteractions > 0) {
    log.info(`已清理 ${created.abortedInteractions} 条上次遗留的挂起请求`);
  }
  if (created.seededProjectId) {
    log.info(`已创建示例项目 ${created.seededProjectId}（API Key: sk-mock-demo）`);
  }
  log.info(`Mock 服务已启动 ${current.url}`);
  return current;
}

/** 停掉 Fastify 但保留数据库连接，之后可以再 startServer()。 */
export async function stopServer(): Promise<void> {
  if (!instance) return;
  const server = loadServerModule();
  await server.stopServer(instance);
  instance = null;
  current = null;
}

export async function restartServer(): Promise<ServerInfo> {
  await stopServer();
  return startServer();
}

/** 退出前调用，释放 SQLite。 */
export async function shutdownServer(): Promise<void> {
  if (!serverModule) return;
  try {
    await serverModule.shutdownServer(instance);
  } catch (error) {
    log.warn('关闭服务时出错', error);
  }
  instance = null;
  current = null;
}
