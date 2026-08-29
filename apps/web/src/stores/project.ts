import { create } from 'zustand';
import type { CreateProjectInput, Project, UpdateProjectInput } from '@agent-mock/shared';
import { projectApi } from '../api/project';

interface ProjectState {
  projects: Project[];
  current: Project | null;
  loading: boolean;
  error: string | null;
  loadProjects: () => Promise<void>;
  loadProject: (projectId: string) => Promise<Project | null>;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  updateProject: (projectId: string, input: UpdateProjectInput) => Promise<Project>;
  removeProject: (projectId: string) => Promise<void>;
  rotateKey: (projectId: string) => Promise<Project>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  current: null,
  loading: false,
  error: null,

  loadProjects: async () => {
    set({ loading: true, error: null });
    try {
      set({ projects: await projectApi.list(), loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  loadProject: async (projectId) => {
    if (get().current?.id === projectId) return get().current;
    set({ loading: true, error: null });
    try {
      const project = await projectApi.get(projectId);
      set({ current: project, loading: false });
      return project;
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  },

  createProject: async (input) => {
    const project = await projectApi.create(input);
    set((state) => ({ projects: [project, ...state.projects] }));
    return project;
  },

  updateProject: async (projectId, input) => {
    const project = await projectApi.update(projectId, input);
    set((state) => ({
      projects: state.projects.map((item) => (item.id === projectId ? project : item)),
      current: state.current?.id === projectId ? project : state.current,
    }));
    return project;
  },

  removeProject: async (projectId) => {
    await projectApi.remove(projectId);
    set((state) => ({
      projects: state.projects.filter((item) => item.id !== projectId),
      current: state.current?.id === projectId ? null : state.current,
    }));
  },

  rotateKey: async (projectId) => {
    const project = await projectApi.rotateKey(projectId);
    set((state) => ({
      projects: state.projects.map((item) => (item.id === projectId ? project : item)),
      current: state.current?.id === projectId ? project : state.current,
    }));
    return project;
  },
}));
