import type {
  CreateProjectInput,
  Interaction,
  Project,
  UpdateProjectInput,
} from '@agent-mock/shared';
import { del, get, post, put } from './client';

export const projectApi = {
  list: () => get<{ items: Project[] }>('/projects').then((data) => data.items),
  get: (projectId: string) => get<Project>(`/projects/${projectId}`),
  create: (input: CreateProjectInput) => post<Project>('/projects', input),
  update: (projectId: string, input: UpdateProjectInput) =>
    put<Project>(`/projects/${projectId}`, input),
  remove: (projectId: string) => del(`/projects/${projectId}`),
  rotateKey: (projectId: string) => post<Project>(`/projects/${projectId}/rotate-key`),
  waiting: (projectId: string) =>
    get<{ items: Interaction[] }>(`/projects/${projectId}/waiting`).then((data) => data.items),
};
