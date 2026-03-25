import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api } from '@/services/api';
import { authStorage } from '@/lib/auth-storage';
import { ApiError } from '@/lib/api-error';
import { UserRole } from '@properfy/shared';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
  phone?: string | null;
  totpEnabled?: boolean;
  lastLoginAt?: string | null;
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

function normalizePwaUser(user: AuthUser): AuthUser {
  if (user.role !== UserRole.INSP) {
    throw new ApiError(
      403,
      'This app is only available for inspectors.',
      'AUTH_ROLE_NOT_SUPPORTED',
    );
  }

  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(authStorage.getAccessToken());
  const [isLoading, setIsLoading] = useState(authStorage.hasTokens());

  useEffect(() => {
    if (!authStorage.hasTokens()) return;

    api.GET('/v1/me')
      .then(({ data }) => {
        if (data) {
          const me = data as typeof data & {
            phone?: string | null;
            totpEnabled?: boolean;
            lastLoginAt?: string | null;
          };
          setUser(normalizePwaUser({
            id: me.id,
            name: me.name,
            email: me.email,
            role: me.role,
            tenantId: me.tenantId,
            phone: me.phone,
            totpEnabled: me.totpEnabled,
            lastLoginAt: me.lastLoginAt,
          }));
        }
      })
      .catch(() => {
        authStorage.clearTokens();
        setToken(null);
        setUser(null);
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
    try {
      const user = normalizePwaUser(data.user);
      authStorage.setTokens(data.accessToken, data.refreshToken);
      setToken(data.accessToken);
      setUser(user);
    } catch (roleError) {
      authStorage.clearTokens();
      setToken(null);
      setUser(null);
      throw roleError;
    }
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
