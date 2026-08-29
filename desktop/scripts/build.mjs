// 把 monorepo 里的 server / web 产物打成 Electron 可直接加载的三份 bundle：
//   dist/main/index.cjs      Electron 主进程
//   dist/preload/index.cjs   预加载脚本
//   dist/server/index.cjs    整个 Fastify 服务端（含 drizzle / zod / fastify 等依赖）
//   dist/web/                apps/web 的构建产物
//   dist/renderer/           启动与错误提示页
//
// 只有 better-sqlite3 保持 external —— 原生模块必须由 electron-builder
// 按 Electron 的 ABI 重新编译，不能被 bundle。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const repoRoot = path.resolve(desktopDir, '..');
const distDir = path.join(desktopDir, 'dist');
const webDistDir = path.join(repoRoot, 'apps', 'web', 'dist');

const isDev = process.argv.includes('--dev');
const skipWeb = process.argv.includes('--skip-web');

/** apps/server/src/config.ts 用了 import.meta.url，而我们输出的是 CJS，需要垫一层。 */
const IMPORT_META_URL_SHIM =
  "const __import_meta_url = require('node:url').pathToFileURL(__filename).href;";

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: isDev ? 'inline' : false,
  minify: !isDev,
  // 默认会把中文转义成 \uXXXX，产物既变大又不好 grep。
  charset: 'utf8',
  logLevel: 'info',
  logOverride: {
    // pino / fastify 内部有动态 require，bundle 后不影响运行（未启用 transport）。
    'require-resolve-not-external': 'silent',
  },
};

async function bundleMain() {
  await esbuild.build({
    ...shared,
    entryPoints: [path.join(desktopDir, 'src', 'main', 'index.ts')],
    outfile: path.join(distDir, 'main', 'index.cjs'),
    external: ['electron'],
    define: { 'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production') },
  });
}

async function bundlePreload() {
  await esbuild.build({
    ...shared,
    entryPoints: [path.join(desktopDir, 'src', 'preload', 'index.ts')],
    outfile: path.join(distDir, 'preload', 'index.cjs'),
    external: ['electron'],
  });
}

async function bundleServer() {
  await esbuild.build({
    ...shared,
    entryPoints: [path.join(desktopDir, 'src', 'server', 'entry.ts')],
    outfile: path.join(distDir, 'server', 'index.cjs'),
    external: ['better-sqlite3', 'electron'],
    // 服务端源码里的 import.meta.url 会被换成上面 banner 里的常量。
    define: { 'import.meta.url': '__import_meta_url' },
    banner: { js: IMPORT_META_URL_SHIM },
    // fastify 会读自身 package.json 判断版本。
    loader: { '.json': 'json' },
  });
}

function buildWeb() {
  if (skipWeb) {
    console.log('[desktop] --skip-web，跳过 web 构建');
    return;
  }
  console.log('[desktop] 构建 apps/web …');
  const result = spawnSync('pnpm', ['--filter', '@agent-mock/web', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error('apps/web 构建失败，请先在仓库根目录执行 pnpm install');
  }
}

function copyWebDist() {
  if (!fs.existsSync(path.join(webDistDir, 'index.html'))) {
    throw new Error(`找不到 web 构建产物：${webDistDir}，请先执行 pnpm build`);
  }
  const target = path.join(distDir, 'web');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(webDistDir, target, { recursive: true });
  console.log(`[desktop] 已复制 web 产物 → ${path.relative(desktopDir, target)}`);
}

function copyRenderer() {
  const source = path.join(desktopDir, 'src', 'renderer');
  const target = path.join(distDir, 'renderer');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}

async function main() {
  fs.rmSync(distDir, { recursive: true, force: true });
  buildWeb();
  await Promise.all([bundleMain(), bundlePreload(), bundleServer()]);
  copyWebDist();
  copyRenderer();
  console.log('[desktop] 构建完成');
}

main().catch((error) => {
  console.error('[desktop] 构建失败:', error);
  process.exit(1);
});
