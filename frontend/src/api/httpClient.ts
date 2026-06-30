export class ApiError extends Error {
  status?: number;
  data?: unknown;

  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

type QueryValue = string | number | boolean | null | undefined;

type RequestOptions = {
  headers?: Record<string, string>;
  params?: Record<string, QueryValue>;
  signal?: AbortSignal;
};

export type ApiResponse<T = unknown> = {
  data: T;
  status: number;
  headers: Headers;
  raw: Response;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  '/api/v1';

function normalizePath(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const base = String(API_BASE_URL).replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${base}${cleanPath}`;
}

function getStoredToken(): string | null {
  const directKeys = [
    'access_token',
    'accessToken',
    'token',
    'auth_token',
    'gabriel_access_token',
  ];

  for (const key of directKeys) {
    const localValue = localStorage.getItem(key);
    if (localValue) return localValue;

    const sessionValue = sessionStorage.getItem(key);
    if (sessionValue) return sessionValue;
  }

  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      const value = storage.getItem(key);
      if (!value) continue;

      try {
        const parsed = JSON.parse(value);

        const possibleToken =
          parsed?.access_token ||
          parsed?.accessToken ||
          parsed?.token ||
          parsed?.state?.access_token ||
          parsed?.state?.accessToken ||
          parsed?.state?.token;

        if (possibleToken) {
          return String(possibleToken);
        }
      } catch {
        // ignora valores que não são JSON
      }
    }
  }

  return null;
}

function buildUrl(path: string, params?: Record<string, QueryValue>): string {
  const url = new URL(normalizePath(path), window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const token = getStoredToken();

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };

  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path, options.params), {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    signal: options.signal,
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'detail' in data
        ? String((data as { detail: unknown }).detail)
        : `Erro HTTP ${response.status}`;

    throw new ApiError(message, response.status, data);
  }

  return {
    data: data as T,
    status: response.status,
    headers: response.headers,
    raw: response,
  };
}

export const httpClient = {
  request,

  get: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>('GET', path, undefined, options),

  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),

  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),

  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),

  delete: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),

  del: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
};

export const api = httpClient;

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    return String((error as { message: unknown }).message);
  }

  return 'Erro inesperado ao comunicar com a API.';
}

export default api;
