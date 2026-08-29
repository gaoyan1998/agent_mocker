import fs from 'node:fs';
import path from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { registerManagementApi } from './api/index.js';
import { config } from './config.js';
import { HttpError } from './lib/errors.js';
import { registerMockApi } from './mock/index.js';

/**
 * 只打印 Agent 打过来的 /v1 请求；Web UI 的轮询与 SSE 不记日志，
 * 否则控制台会被前端刷满。
 */
function buildLogController(): LogController {
  return new LogController({
    disableRequestLogging: (request) =>
      config.logLevel !== 'debug' && !isMockApiUrl(request.url),
  });
}

function isMockApiUrl(url: string): boolean {
  const pathname = url.split('?', 1)[0] ?? url;
  return pathname.startsWith('/v1') || /^\/[^/]+\/v1(?:\/|$)/.test(pathname);
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: process.stdout.isTTY
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
    },
    // Agent 的 prompt 可能很大，放宽默认的 1MB 限制。
    bodyLimit: 32 * 1024 * 1024,
    logController: buildLogController(),
  });

  await app.register(cors, { origin: true, exposedHeaders: ['*'] });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply
        .code(error.status)
        .send({ error: { message: error.message, code: error.code, details: error.details } });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: { message: '参数校验失败', code: 'bad_request', details: error.issues },
      });
    }
    const fallback = error as { statusCode?: number; message?: string };
    const status = typeof fallback.statusCode === 'number' ? fallback.statusCode : 500;
    if (status >= 500) request.log.error({ err: error }, '请求处理失败');
    return reply
      .code(status)
      .send({ error: { message: fallback.message || '服务器内部错误', code: 'internal_error' } });
  });

  // /v1/* 给 Agent，/api/* 给 Web UI。
  await registerMockApi(app);
  await registerManagementApi(app);

  await registerWebUi(app);

  return app;
}

/** 生产模式：如果 web 已经 build 过，就顺手把静态资源托管起来（单端口部署）。 */
async function registerWebUi(app: FastifyInstance): Promise<void> {
  const indexPath = path.join(config.webDistDir, 'index.html');
  const hasWebDist = fs.existsSync(indexPath);

  if (hasWebDist) {
    await app.register(fastifyStatic, {
      root: config.webDistDir,
      prefix: '/',
      wildcard: false,
    });
  }

  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url.startsWith('/api') || isMockApiUrl(request.url);
    if (!isApi && hasWebDist && request.method === 'GET') {
      // SPA 路由回退。
      return reply.type('text/html; charset=utf-8').send(fs.readFileSync(indexPath, 'utf8'));
    }
    return reply.code(404).send({
      error: {
        message: `找不到路由 ${request.method} ${request.url}`,
        code: 'not_found',
      },
    });
  });
}
