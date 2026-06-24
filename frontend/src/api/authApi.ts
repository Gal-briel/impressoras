import { httpClient } from './httpClient';
import type { LoginPayload, LoginResponse, User, AuthTokens } from '../types/auth';

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await httpClient.post<LoginResponse>('/auth/login', payload);
  return data;
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const { data } = await httpClient.post<AuthTokens>('/auth/refresh', { refresh_token: refreshToken });
  return data;
}

export async function logout(): Promise<void> {
  await httpClient.post('/auth/logout');
}

export async function getMe(): Promise<User> {
  const { data } = await httpClient.get<User>('/me');
  return data;
}
