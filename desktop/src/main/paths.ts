import path from 'node:path';
import { app } from 'electron';

/** userData / 日志目录都按这个名字走，避免出现 @agent-mock/desktop 这种带斜杠的目录名。 */
export const APP_NAME = 'Agent Mocker';

/**
 * asar 内的路径。打包后为 .../resources/app.asar，开发模式下就是 desktop/。
 * 所有路径都做成函数而不是模块级常量，因为 app.getPath() 必须在 app.setName()
 * 之后调用才能拿到正确的 userData 目录。
 */
function appRoot(): string {
  return app.getAppPath();
}

/**
 * asarUnpack 出来的实体目录。原生模块和 @fastify/static 的静态根目录都在这里，
 * 因为 .node 无法从 asar 内 dlopen，而 @fastify/static 会对 root 做 realpath 校验。
 */
function unpackedRoot(): string {
  const root = appRoot();
  return root.includes('app.asar') ? root.replace(/app\.asar(?=$|[\\/])/, 'app.asar.unpacked') : root;
}

/** 服务端 bundle，由主进程在设置好 MOCK_* 环境变量之后 require。 */
export function serverBundlePath(): string {
  return path.join(appRoot(), 'dist', 'server', 'index.cjs');
}

/** apps/web 的构建产物，交给 Fastify 静态托管。 */
export function webDistDir(): string {
  return path.join(unpackedRoot(), 'dist', 'web');
}

export function preloadPath(): string {
  return path.join(appRoot(), 'dist', 'preload', 'index.cjs');
}

/** 启动中 / 启动失败的提示页。 */
export function rendererFile(name: 'loading' | 'error'): string {
  return path.join(appRoot(), 'dist', 'renderer', `${name}.html`);
}

/** SQLite 与用户配置放在 userData 下，升级应用不会丢数据。 */
export function dataDir(): string {
  return path.join(app.getPath('userData'), 'data');
}

export function databasePath(): string {
  return path.join(dataDir(), 'mock.db');
}

export function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function logFilePath(): string {
  return path.join(app.getPath('logs'), 'main.log');
}
