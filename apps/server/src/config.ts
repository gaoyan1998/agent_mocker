import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** monorepo 根目录：apps/server/src -> ../../.. */
export const rootDir = path.resolve(here, '../../..');

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  version: '0.1.0',
  startedAt: Date.now(),
  host: process.env.MOCK_HOST ?? '0.0.0.0',
  port: num(process.env.MOCK_PORT, 3000),
  logLevel: process.env.MOCK_LOG_LEVEL ?? 'info',
  databasePath: process.env.MOCK_DB_PATH ?? path.join(rootDir, 'data', 'mock.db'),
  /** 生产模式下如果 web 已构建，则由 server 直接托管静态资源。 */
  webDistDir: process.env.MOCK_WEB_DIST ?? path.join(rootDir, 'apps', 'web', 'dist'),
  /**
   * 为 false 时，未匹配到 API Key 的 /v1 请求会落到「唯一项目」上，
   * 方便本地只有一个项目时连 api_key 都不用改。
   */
  strictApiKey: process.env.MOCK_STRICT_API_KEY !== 'false',
  /** api_logs 里单条 body 的最大保存长度，避免日志表膨胀。 */
  maxLogBodyChars: num(process.env.MOCK_MAX_LOG_BODY, 40_000),
  /** SSE 心跳间隔。 */
  ssePingIntervalMs: num(process.env.MOCK_SSE_PING_MS, 25_000),
} as const;

export type AppConfig = typeof config;
