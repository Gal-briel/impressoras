// frontend/src/presentation/components/Guard/RequireAuth.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../../application/store/authStore';

interface RequireAuthProps {
  requiredPermission?: string;
}

export const RequireAuth = ({ requiredPermission }: RequireAuthProps) => {
  const { user, token, hasPermission } = useAuthStore();
  const location = useLocation();

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};