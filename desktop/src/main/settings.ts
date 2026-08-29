import fs from 'node:fs';
import path from 'node:path';
import { log } from './logger.js';
import { settingsPath } from './paths.js';

export interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

export interface Settings {
  /** Mock API 监听端口。被占用时会自动顺延，但下次启动仍优先用这个值。 */
  port: number;
  /**
   * 默认只监听回环地址。改成 0.0.0.0 可以让同网段的其它机器 / 容器里的 Agent 连进来，
   * 但会把 Mock API 暴露到局域网，请自行确认网络环境。
   */
  host: string;
  /** 为 false 时，未匹配 API Key 的 /v1 请求会落到唯一项目上。与服务端默认值保持一致。 */
  strictApiKey: boolean;
  logLevel: string;
  window: WindowBounds;
}

const DEFAULTS: Settings = {
  port: 3000,
  host: '127.0.0.1',
  strictApiKey: true,
  logLevel: 'info',
  window: { width: 1440, height: 900 },
};

let cache: Settings | null = null;

export function loadSettings(): Settings {
  if (cache) return cache;
  cache = { ...DEFAULTS, window: { ...DEFAULTS.window } };
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<Settings>;
    cache = {
      port: normalizePort(parsed.port),
      host: typeof parsed.host === 'string' && parsed.host ? parsed.host : DEFAULTS.host,
      strictApiKey:
        typeof parsed.strictApiKey === 'boolean' ? parsed.strictApiKey : DEFAULTS.strictApiKey,
      logLevel: typeof parsed.logLevel === 'string' ? parsed.logLevel : DEFAULTS.logLevel,
      window: { ...DEFAULTS.window, ...(parsed.window ?? {}) },
    };
  } catch (error) {
    // 首次启动没有文件是正常的，其它错误记一笔然后用默认值兜底。
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn('读取 settings.json 失败，使用默认配置', error);
    }
  }
  return cache;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  cache = next;
  try {
    const file = settingsPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch (error) {
    log.warn('写入 settings.json 失败', error);
  }
  return next;
}

function normalizePort(value: unknown): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : DEFAULTS.port;
}
