import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from '../layouts/RootLayout';
import { ProjectLayout } from '../layouts/ProjectLayout';
import { ProjectsPage } from '../pages/Projects';
import { WorkbenchPage } from '../pages/Workbench';
import { SessionsPage } from '../pages/Sessions';
import { RulesPage } from '../pages/Rules';
import { ScenariosPage } from '../pages/Scenarios';
import { ToolsPage } from '../pages/Tools';
import { LogsPage } from '../pages/Logs';
import { ProjectSettingsPage } from '../pages/ProjectSettings';
import { GlobalSettingsPage } from '../pages/GlobalSettings';
import { UpstreamAiPage } from '../pages/UpstreamAi';

/** 前端路由。 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'projects', element: <ProjectsPage /> },
      {
        path: 'projects/:projectId',
        element: <ProjectLayout />,
        children: [
          { index: true, element: <Navigate to="workbench" replace /> },
          { path: 'workbench', element: <WorkbenchPage /> },
          { path: 'sessions', element: <SessionsPage /> },
          { path: 'rules', element: <RulesPage /> },
          { path: 'scenarios', element: <ScenariosPage /> },
          { path: 'tools', element: <ToolsPage /> },
          { path: 'logs', element: <LogsPage /> },
          { path: 'upstream-ai', element: <UpstreamAiPage /> },
          { path: 'settings', element: <ProjectSettingsPage /> },
        ],
      },
      { path: 'settings', element: <GlobalSettingsPage /> },
      { path: '*', element: <Navigate to="/projects" replace /> },
    ],
  },
]);
