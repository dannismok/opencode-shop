import axios from 'axios';
import type { AxiosError } from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const ACCESS_TOKEN_KEY = 'oshop_access_token';
export const REFRESH_TOKEN_KEY = 'oshop_refresh_token';

const store = {
  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  set accessToken(value: string | null) {
    if (value) localStorage.setItem(ACCESS_TOKEN_KEY, value);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  },
  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  set refreshToken(value: string | null) {
    if (value) localStorage.setItem(REFRESH_TOKEN_KEY, value);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export function clearTokens() {
  store.accessToken = null;
  store.refreshToken = null;
}

export function setTokens(accessToken: string, refreshToken: string) {
  store.accessToken = accessToken;
  store.refreshToken = refreshToken;
}

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = store.refreshToken;
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, { refreshToken });
    setTokens(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  } catch {
    clearTokens();
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = store.accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried && store.refreshToken) {
      original._retried = true;
      refreshPromise = refreshPromise ?? refreshAccessToken();
      const newToken = await refreshPromise;
      refreshPromise = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

export function getApiError(error: unknown): ApiErrorPayload['error'] {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiErrorPayload | undefined;
    if (data?.error) return data.error;
    return { code: 'NETWORK_ERROR', message: 'Network error. Please try again.' };
  }
  return { code: 'UNKNOWN', message: 'Something went wrong' };
}
