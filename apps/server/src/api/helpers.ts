import type { z } from 'zod';
import type { DebugSession, Interaction, Project } from '@agent-mock/shared';
import { badRequest, notFound } from '../lib/errors.js';
import { findInteraction } from '../repositories/interactions.js';
import { findProject } from '../repositories/projects.js';
import { findSession } from '../repositories/sessions.js';

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw badRequest(
      `参数校验失败：${result.error.issues
        .map((issue) => `${issue.path.join('.') || 'body'} ${issue.message}`)
        .join('; ')}`,
      result.error.issues,
    );
  }
  return result.data;
}

export function requireProject(projectId: string): Project {
  const project = findProject(projectId);
  if (!project) throw notFound('项目');
  return project;
}

export function requireSession(sessionId: string): DebugSession {
  const session = findSession(sessionId);
  if (!session) throw notFound('会话');
  return session;
}

export function requireInteraction(interactionId: string): Interaction {
  const interaction = findInteraction(interactionId);
  if (!interaction) throw notFound('Interaction');
  return interaction;
}

export function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
