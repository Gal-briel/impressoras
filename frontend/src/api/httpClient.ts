import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { env } from '../utils/env';
import { useAuthStore } from '../stores/authStore';
import type { AuthTokens } from '../types/auth';

let refreshRequest: Promise<AuthTokens> | null = null;

export const httpClient = axios.create({
  baseURL: env.apiUrl,
  headers: { 'Content-Type': 'application/json' },
});

type RetriableRequest = AxiosRequestConfig & { _retry?: boolean };

httpClient.interceptors.request.use((config) => {
  const { accessToken, user } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (user?.tenant_id) {
    config.headers['X-Tenant-ID'] = user.tenant_id;
  }
  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequest | undefined;

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    const { refreshToken, updateAccessToken, clearSession } = useAuthStore.getState();
    if (!refreshToken) {
      clearSession();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      refreshRequest ??= axios
        .post<AuthTokens>(`${env.apiUrl}/auth/refresh`, { refresh_token: refreshToken })
        .then((response) => response.data)
        .finally(() => {
          refreshRequest = null;
        });

      const tokens = await refreshRequest;
      updateAccessToken(tokens.access_token);
      originalRequest.headers = {
        ...(originalRequest.headers ?? {}),
        Authorization: `Bearer ${tokens.access_token}`,
      };
      return httpClient(originalRequest);
    } catch (refreshError) {
      clearSession();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    }
  },
);

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((item) => item.msg).join(', ');
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
