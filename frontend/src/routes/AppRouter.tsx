import { Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage } from '../features/auth/pages/LoginPage';
import { AgentDetailsPage } from '../features/agents/pages/AgentDetailsPage';
import { AgentsPage } from '../features/agents/pages/AgentsPage';
import { CommandsPage } from '../features/commands/pages/CommandsPage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';
import { PrinterDetailsPage } from '../features/printers/pages/PrinterDetailsPage';
import { PrintersPage } from '../features/printers/pages/PrintersPage';
import { MainLayout } from '../layouts/MainLayout';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { InventoryDevicesPage } from '../features/inventory/pages/InventoryDevicesPage';
import { BulkCommandsPage } from '../features/bulk-commands/pages/BulkCommandsPage';
import { CommandHistoryPage } from '../features/command-history/pages/CommandHistoryPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<MainLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/inventory" element={<InventoryDevicesPage />} />
        <Route path="/bulk-commands" element={<BulkCommandsPage />} />
        <Route path="/command-history" element={<CommandHistoryPage />} />
        <Route path="/agents/:id" element={<AgentDetailsPage />} />
        <Route path="/printers" element={<PrintersPage />} />
        <Route path="/printers/:id" element={<PrinterDetailsPage />} />
        <Route path="/commands" element={<CommandsPage />} />
        <Route path="/audit" element={<PlaceholderPage title="Auditoria" />} />
        <Route path="/settings" element={<PlaceholderPage title="Configurações" />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
  );
}
