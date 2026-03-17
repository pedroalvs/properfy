import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { apiClient } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';

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

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

interface MeResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
  branchId: string | null;
  totpEnabled: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(authStorage.getAccessToken());
  const [isLoading, setIsLoading] = useState(authStorage.hasTokens());

  useEffect(() => {
    if (!authStorage.hasTokens()) return;

    apiClient.get<MeResponse>('/v1/me')
      .then((me) => {
        setUser({
          id: me.id,
          name: me.name,
          email: me.email,
          role: me.role,
          tenantId: me.tenantId,
        });
      })
      .catch(() => {
        authStorage.clearTokens();
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiClient.post<LoginResponse>('/v1/auth/login', { email, password });
    authStorage.setTokens(result.accessToken, result.refreshToken);
    setToken(result.accessToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    apiClient.post('/v1/auth/logout').catch(() => {});
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
