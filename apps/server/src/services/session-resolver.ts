import type { DebugSession, Project } from '@agent-mock/shared';
import { config } from '../config.js';
import { publish } from '../lib/events.js';
import {
  findProjectByApiKey,
  findProject,
  findSoleProject,
} from '../repositories/projects.js';
import {
  createSession,
  findReusableAutoSession,
  findSessionByExternalId,
  rowToSession,
} from '../repositories/sessions.js';

export const HEADER_SESSION_NAME = 'x-mock-session-name';
export const HEADER_PROJECT_ID = 'x-mock-project-id';

export function extractApiKey(headers: Record<string, unknown>): string | null {
  const authorization = firstHeader(headers.authorization);
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match) return match[1]!.trim();
    return authorization.trim();
  }
  return firstHeader(headers['api-key']) ?? firstHeader(headers['x-api-key']) ?? null;
}

function firstHeader(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

/** HTTP 头只能放 ASCII，所以允许调用方把中文名 percent-encode 之后再传。 */
function decodeHeader(value: string | null): string | null {
  if (value == null) return null;
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * API Key → Project。
 * X-Mock-Project-ID 作为辅助手段；MOCK_STRICT_API_KEY=false 时，
 * 只有一个项目的场景下允许任意 key 落到该项目上，降低接入成本。
 */
export function resolveProject(headers: Record<string, unknown>): Project | null {
  const apiKey = extractApiKey(headers);
  if (apiKey) {
    const byKey = findProjectByApiKey(apiKey);
    if (byKey) return byKey;
  }

  const projectId = firstHeader(headers[HEADER_PROJECT_ID]);
  if (projectId) {
    const byId = findProject(projectId);
    if (byId) return byId;
  }

  if (!config.strictApiKey) return findSoleProject();
  return null;
}

export interface ResolvedSession {
  session: DebugSession;
  created: boolean;
}

/**
 * URL 中的 /:sessionId/v1 → Session。
 * URL 没有会话 ID 时复用「最近活跃的自动会话」，超过空闲窗口才新建，
 * 这样 Agent 一次运行里的多个请求会自然归档到同一个 Session。
 */
export function resolveSession(
  project: Project,
  headers: Record<string, unknown>,
  urlSessionId?: string,
): ResolvedSession {
  // Session IDs are carried in the URL (`/:sessionId/v1/...`) so clients that
  // cannot send custom headers can still bind requests to a session.
  const externalId = urlSessionId?.trim();
  const nameHint = decodeHeader(firstHeader(headers[HEADER_SESSION_NAME]))?.trim();

  if (externalId) {
    const existing = findSessionByExternalId(project.id, externalId);
    if (existing) return { session: rowToSession(existing), created: false };
    const session = createSession({
      projectId: project.id,
      name: nameHint || externalId,
      externalId,
      auto: false,
      description: '由 URL 会话 ID 自动创建',
    });
    publishSessionCreated(session);
    return { session, created: true };
  }

  const reusable = findReusableAutoSession(project.id, project.settings.autoSessionIdleMs);
  if (reusable) return { session: rowToSession(reusable), created: false };
  const session = createSession({
    projectId: project.id,
    name: nameHint || undefined,
    auto: true,
    description: 'URL 未指定会话 ID，由 Mock Server 自动创建',
  });
  publishSessionCreated(session);
  return { session, created: true };
}

export function publishSessionCreated(session: DebugSession): void {
  publish({
    type: 'session.created',
    projectId: session.projectId,
    sessionId: session.id,
    session,
  });
}

export function publishSessionUpdated(session: DebugSession): void {
  publish({
    type: 'session.updated',
    projectId: session.projectId,
    sessionId: session.id,
    session,
  });
}
