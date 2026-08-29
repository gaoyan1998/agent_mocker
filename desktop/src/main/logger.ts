import fs from 'node:fs';
import path from 'node:path';
import { logFilePath } from './paths.js';

// 打包后 stdout 没有去处，服务端自身的请求日志又已经写进了数据库（Web UI 的 Logs 页面），
// 所以这里只落地启动流程和异常，用来排查“装好了打不开”这类问题。
let stream: fs.WriteStream | null = null;

function ensureStream(): fs.WriteStream | null {
  if (stream) return stream;
  try {
    const file = logFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    stream = fs.createWriteStream(file, { flags: 'a' });
  } catch {
    // 日志写不了不该影响应用启动。
    stream = null;
  }
  return stream;
}

function write(level: string, message: string, detail?: unknown): void {
  const line = `${new Date().toISOString()} [${level}] ${message}${
    detail === undefined ? '' : ` ${formatDetail(detail)}`
  }\n`;
  if (level === 'error') process.stderr.write(line);
  else process.stdout.write(line);
  ensureStream()?.write(line);
}

function formatDetail(detail: unknown): string {
  if (detail instanceof Error) return `${detail.message}\n${detail.stack ?? ''}`;
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export const log = {
  info: (message: string, detail?: unknown) => write('info', message, detail),
  warn: (message: string, detail?: unknown) => write('warn', message, detail),
  error: (message: string, detail?: unknown) => write('error', message, detail),
  close: () => {
    stream?.end();
    stream = null;
  },
};
