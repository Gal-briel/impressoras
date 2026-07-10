import { Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage } from '../features/auth/pages/LoginPage';
import { AgentDetailsPage } from '../features/agents/pages/AgentDetailsPage';
import { AgentsPage } from '../features/agents/pages/AgentsPage';
import { CommandsPage } from '../features/commands/pages/CommandsPage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';
import { PrinterDetailsPage } from '../features/printers/pages/PrinterDetailsPage';
import { PrintersPage } from '../features/printers/pages/PrintersPage';
import { MainLayout } from '../layouts/MainLayout';
import { InventoryDevicesPage } from '../features/inventory/pages/InventoryDevicesPage';
import { BulkCommandsPage } from '../features/bulk-commands/pages/BulkCommandsPage';
import { CommandHistoryPage } from '../features/command-history/pages/CommandHistoryPage';
import { SecurityAlertsPage } from '../features/securityAlerts/pages/SecurityAlertsPage';
import { SoftwareInventoryChangesPage } from '../features/softwareInventoryChanges/pages/SoftwareInventoryChangesPage';
import { OperationalAlertsPage } from '../features/operationalAlerts/pages/OperationalAlertsPage';
import { NotificationsPage } from '../features/notifications/pages/NotificationsPage';
import { ReportsPage } from '../features/reports/pages/ReportsPage';
import { AuditPage } from '../pages/Audit/AuditPage';
import { SettingsPage } from '../pages/Settings/SettingsPage';
import { UsersPage } from '../pages/Settings/UsersPage';
import { RolesPage } from '../pages/Settings/RolesPage';
import { ProtectedRoute } from './ProtectedRoute';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route element={<ProtectedRoute requiredPermission="dashboard:read" />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>

          <Route element={<ProtectedRoute requiredPermission="inventory:read" />}>
            <Route path="/security-alerts" element={<SecurityAlertsPage />} />
            <Route path="/software-changes" element={<SoftwareInventoryChangesPage />} />
            <Route path="/inventory" element={<InventoryDevicesPage />} />
          </Route>

          <Route element={<ProtectedRoute requiredPermission="operational-alerts:read" />}>
            <Route path="/operational-alerts" element={<OperationalAlertsPage />} />
          </Route>

          <Route element={<ProtectedRoute requiredPermission="notifications:read" />}>
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>

          <Route element={<ProtectedRoute requiredPermission="reports:read" />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>

          <Route element={<ProtectedRoute requiredPermission="agents:read" />}>
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/agents/:id" element={<AgentDetailsPage />} />
          </Route>

          <Route element={<ProtectedRoute requiredPermission="commands:execute" />}>
            <Route path="/bulk-commands" element={<BulkCommandsPage />} />
          </Route>

          <Route element={<ProtectedRoute requiredPermission="commands:read" />}>
            <Route path="/command-history" element={<CommandHistoryPage />} />
            <Route path="/commands" element={<CommandsPage />} />
          </Route>

          <Route element={<ProtectedRoute requiredPermission="printers:read" />}>
            <Route path="/printers" element={<PrintersPage />} />
            <Route path="/printers/:id" element={<PrinterDetailsPage />} />
          </Route>

          <Route element={<ProtectedRoute requiredPermission="audit:read" />}>
            <Route path="/audit" element={<AuditPage />} />
          </Route>

          <Route element={<ProtectedRoute requiredPermission="settings:read" />}>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/roles" element={<RolesPage />} />
          </Route>

          <Route element={<ProtectedRoute requiredPermission="users:manage" />}>
            <Route path="/settings/users" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
