import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api } from '@/services/api';
import { authStorage } from '@/lib/auth-storage';
import { ApiError } from '@/lib/api-error';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(authStorage.getAccessToken());
  const [isLoading, setIsLoading] = useState(authStorage.hasTokens());

  useEffect(() => {
    if (!authStorage.hasTokens()) return;

    api.GET('/v1/me')
      .then(({ data }) => {
        if (data) {
          setUser({
            id: data.id,
            name: data.name,
            email: data.email,
            role: data.role,
            tenantId: data.tenantId,
          });
        }
      })
      .catch(() => {
        authStorage.clearTokens();
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error, response } = await api.POST('/v1/auth/login', {
      body: { email, password },
    });
    const err = error as any;
    if (err || !data) {
      throw new ApiError(
        response.status,
        err?.error?.message ?? 'Login failed',
        err?.error?.code,
      );
    }
    authStorage.setTokens(data.accessToken, data.refreshToken);
    setToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    api.POST('/v1/auth/logout').catch(() => {});
    authStorage.clearTokens();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: user !== null,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
