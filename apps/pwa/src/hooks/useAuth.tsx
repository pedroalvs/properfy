import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api } from '@/services/api';
import { authStorage } from '@/lib/auth-storage';
import { ApiError } from '@/lib/api-error';
import { UserRole } from '@properfy/shared';
import { clearPostLoginRedirect } from '@/lib/post-login-redirect';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
  status?: string;
  phone?: string | null;
  totpEnabled?: boolean;
  lastLoginAt?: string | null;
  inspectorId?: string | null;
  inspectorPhotoUrl?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
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
            status?: string;
            phone?: string | null;
            totpEnabled?: boolean;
            lastLoginAt?: string | null;
          };
          const meExt = me as typeof me & {
            inspectorId?: string | null;
            inspectorPhotoUrl?: string | null;
          };
          setUser(normalizePwaUser({
            id: me.id,
            name: me.name,
            email: me.email,
            role: me.role,
            tenantId: me.tenantId,
            status: me.status,
            phone: me.phone,
            totpEnabled: me.totpEnabled,
            lastLoginAt: me.lastLoginAt,
            inspectorId: meExt.inspectorId ?? null,
            inspectorPhotoUrl: meExt.inspectorPhotoUrl ?? null,
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

  const login = useCallback(async (email: string, password: string, totpCode?: string) => {
    const { data, error, response } = await api.POST('/v1/auth/login', {
      body: { email, password, ...(totpCode ? { totpCode } : {}) },
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
      clearPostLoginRedirect();
      setToken(null);
      setUser(null);
      throw roleError;
    }
  }, []);

  const logout = useCallback(() => {
    api.POST('/v1/auth/logout').catch(() => {});
    clearPostLoginRedirect();
    authStorage.clearTokens();
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await api.GET('/v1/me');
    if (data) {
      const me = data as typeof data & {
        status?: string;
        phone?: string | null;
        totpEnabled?: boolean;
        lastLoginAt?: string | null;
        inspectorId?: string | null;
        inspectorPhotoUrl?: string | null;
      };
      setUser(normalizePwaUser({
        id: me.id,
        name: me.name,
        email: me.email,
        role: me.role,
        tenantId: me.tenantId,
        status: me.status,
        phone: me.phone,
        totpEnabled: me.totpEnabled,
        lastLoginAt: me.lastLoginAt,
        inspectorId: me.inspectorId ?? null,
        inspectorPhotoUrl: me.inspectorPhotoUrl ?? null,
      }));
    }
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
        refreshUser,
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
