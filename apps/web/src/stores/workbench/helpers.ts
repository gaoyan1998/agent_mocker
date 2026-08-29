import type { DebugSession } from '@agent-mock/shared';

export function sortSessions(sessions: DebugSession[]): DebugSession[] {
  return [...sessions].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

/**
 * 按 id 覆盖或插入。
 * 新建/回放时，服务端在 HTTP 响应之前就推了 session.created，
 * SSE 往往先到，所以这里必须去重，否则列表里会出现两条一样的会话。
 */
export function upsertSession(
  sessions: DebugSession[],
  session: DebugSession,
): DebugSession[] {
  const exists = sessions.some((item) => item.id === session.id);
  return sortSessions(
    exists
      ? sessions.map((item) => (item.id === session.id ? session : item))
      : [session, ...sessions],
  );
}

/** 用同 id 的新对象替换列表里的一项（不存在时原样返回）。 */
export function replaceSession(
  sessions: DebugSession[],
  session: DebugSession,
): DebugSession[] {
  return sessions.map((item) => (item.id === session.id ? session : item));
}
