import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, clearTokens, getApiError, setTokens } from '../lib/api';
import type { User } from '../lib/types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (phone: string, code: string) => Promise<User>;
  register: (data: { name: string; email: string; phone: string; accountNumber: string }) => Promise<{
    expiresAt: string;
    devCode?: string;
  }>;
  requestOtp: (phone: string) => Promise<{ expiresAt: string; devCode?: string }>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user as User))
      .catch(() => clearTokens())
      .finally(() => setIsLoading(false));
  }, []);

  const requestOtp = useCallback(async (phone: string) => {
    const { data } = await api.post('/auth/request-otp', { phone });
    return data as { expiresAt: string; devCode?: string };
  }, []);

  const register = useCallback(
    async (input: { name: string; email: string; phone: string; accountNumber: string }) => {
      try {
        const { data } = await api.post('/auth/register', input);
        return data as { expiresAt: string; devCode?: string };
      } catch (error) {
        throw new Error(getApiError(error).message);
      }
    },
    [],
  );

  const login = useCallback(async (phone: string, code: string) => {
    try {
      const { data } = await api.post('/auth/verify-otp', { phone, code });
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user as User);
      return data.user as User;
    } catch (error) {
      throw new Error(getApiError(error).message);
    }
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('oshop_refresh_token');
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {
      // ignore logout errors
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAdmin: user?.role === 'ADMIN',
      login,
      register,
      requestOtp,
      logout,
      setUser,
    }),
    [user, isLoading, login, register, requestOtp, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
