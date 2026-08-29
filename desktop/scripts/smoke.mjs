// 冒烟测试：在 Electron 的 Node 运行时里加载打包后的服务端 bundle，
// 验证 node:sqlite（Node 内置模块）、Fastify 以及静态托管都正常。
// 用法：node scripts/smoke.mjs —— 会自动用 Electron 重新拉起自己。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const require = createRequire(import.meta.url);

// 直接用 node 跑的话，换成 Electron 的运行时再跑一遍：桌面版真正的宿主是 Electron，
// 原生模块能不能在它里面加载才是要验证的事情。
if (!process.versions.electron) {
  const electron = require('electron');
  const result = spawnSync(electron, [fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  process.exit(result.status ?? 1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-mocker-smoke-'));
const port = 39_517;

process.env.MOCK_HOST = '127.0.0.1';
process.env.MOCK_PORT = String(port);
process.env.MOCK_DB_PATH = path.join(tmp, 'mock.db');
process.env.MOCK_WEB_DIST = path.join(desktopDir, 'dist', 'web');
process.env.MOCK_STRICT_API_KEY = 'true';
process.env.MOCK_LOG_LEVEL = 'warn';

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

/** 所有请求都带超时：示例项目的兜底行为是「人工介入」，卡住的话 CI 会一直挂着。 */
const get = (url) => fetch(url, { signal: AbortSignal.timeout(15_000) });

const server = require(path.join(desktopDir, 'dist', 'server', 'index.cjs'));
console.log(`runtime: node ${process.versions.node}, electron ${process.versions.electron ?? 'n/a'}`);

const { app, seededProjectId } = await server.createServer();
await app.listen({ host: '127.0.0.1', port });
const base = `http://127.0.0.1:${port}`;

check('SQLite 可写（自动创建示例项目）', Boolean(seededProjectId), seededProjectId ?? '');

const health = await get(`${base}/api/health`);
check('GET /api/health', health.ok, `${health.status}`);

const index = await get(`${base}/`);
const html = await index.text();
check('GET / 返回 Web UI', index.ok && html.includes('<div id="root"'), `${index.status}`);

// SPA 回退：未知路径也应该返回 index.html。
const spa = await get(`${base}/sessions`);
check('SPA 路由回退', spa.ok && (await spa.text()).includes('<div id="root"'), `${spa.status}`);

// 走一次 OpenAI 兼容接口。会话必须显式绑定规则才会参与规则匹配，所以先把示例
// 项目的启用规则都绑到会话上，再发一条能命中「订单查询 → Tool Call」的消息。
const projectRules = (await (await get(`${base}/api/projects/${seededProjectId}/rules`)).json()).items.filter(
  (rule) => rule.enabled,
);
const session = await (
  await fetch(`${base}/api/projects/${seededProjectId}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'smoke', externalId: 'smoke', ruleIds: projectRules.map((rule) => rule.id) }),
    signal: AbortSignal.timeout(15_000),
  })
).json();
const chat = await fetch(`${base}/${session.externalId}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer sk-mock-demo' },
  body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: '查询订单' }] }),
  signal: AbortSignal.timeout(15_000),
});
const body = await chat.json();
const toolCalls = body.choices?.[0]?.message?.tool_calls;
check(
  'POST /v1/chat/completions 命中规则并返回 tool_call',
  chat.ok && Array.isArray(toolCalls) && toolCalls[0]?.function?.name === 'get_order',
  chat.ok ? JSON.stringify(toolCalls?.[0]?.function ?? body.choices?.[0]) : JSON.stringify(body),
);

await server.shutdownServer(app);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(failures.length ? `\n${failures.length} 项失败` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
