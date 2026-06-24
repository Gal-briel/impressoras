import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthLayout } from '../layouts/AuthLayout';
import { MainLayout } from '../layouts/MainLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/Dashboard/DashboardPage';
import { AgentsPage } from '../pages/Agents/AgentsPage';
import { AgentDetailPage } from '../pages/Agents/AgentDetailPage';
import { PrintersPage } from '../pages/Printers/PrintersPage';
import { CommandsPage } from '../pages/Commands/CommandsPage';
import { AuditPage } from '../pages/Audit/AuditPage';
import { SettingsPage } from '../pages/Settings/SettingsPage';
import { UsersPage } from '../pages/Settings/UsersPage';
import { RolesPage } from '../pages/Settings/RolesPage';
import { TenantsPage } from '../pages/Settings/TenantsPage';

const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { element: <ProtectedRoute requiredPermission="agents.read" />, children: [
            { path: '/agents', element: <AgentsPage /> },
            { path: '/agents/:agentId', element: <AgentDetailPage /> },
          ] },
          { element: <ProtectedRoute requiredPermission="printers.read" />, children: [
            { path: '/printers', element: <PrintersPage /> },
          ] },
          { element: <ProtectedRoute requiredPermission="commands.execute" />, children: [
            { path: '/commands', element: <CommandsPage /> },
          ] },
          { element: <ProtectedRoute requiredPermission="audit.read" />, children: [
            { path: '/audit', element: <AuditPage /> },
          ] },
          { element: <ProtectedRoute requiredPermission="settings.read" />, children: [
            { path: '/settings', element: <SettingsPage /> },
            { path: '/settings/users', element: <UsersPage /> },
            { path: '/settings/roles', element: <RolesPage /> },
            { path: '/settings/tenants', element: <TenantsPage /> },
          ] },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
