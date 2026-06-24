import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { getMe } from '../api/authApi';
import { useAuthStore } from '../stores/authStore';

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setSession = useAuthStore((state) => state.setSession);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: Boolean(isAuthenticated && accessToken && refreshToken),
    retry: false,
  });

  useEffect(() => {
    if (meQuery.data && accessToken && refreshToken) {
      setSession(meQuery.data, accessToken, refreshToken);
    }
  }, [accessToken, meQuery.data, refreshToken, setSession]);

  return <>{children}</>;
}
