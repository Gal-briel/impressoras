import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Permission } from '../types/rbac';
import { useAuthStore } from '../stores/authStore';

export function ProtectedRoute({ requiredPermission }: { requiredPermission?: Permission | Permission[] }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const can = useAuthStore((state) => state.can);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!can(requiredPermission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
