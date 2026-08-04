import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { api } from '@/services/api';
import { authStorage } from '@/lib/auth-storage';
import { ApiError } from '@/lib/api-error';
import { clearPostLoginRedirect } from '@/lib/post-login-redirect';
import { setDisplayTimezone } from '@/lib/display-timezone';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
  branchId?: string | null;
  totpEnabled?: boolean;
  phone?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  /** Effective IANA timezone (personal ?? agency ?? platform), from /v1/me. */
  timezone?: string | null;
  /** Personal timezone override; null when inheriting (agency/platform). */
  personalTimezone?: string | null;
  /** 031 — CL_USER granular permission flags (tenant-cohort), from /v1/me. */
  clUserPermissions?: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  logout: () => void;
  /** Refetch /v1/me and update the user state (e.g. after a profile change). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchFullUser(): Promise<AuthUser | null> {
  const { data } = await api.GET('/v1/me');
  if (!data) return null;

  const me = data as typeof data & {
    branchId?: string | null;
    totpEnabled?: boolean;
    phone?: string | null;
    lastLoginAt?: string | null;
    createdAt?: string;
    clUserPermissions?: string[];
  };
  return {
    id: me.id,
    name: me.name,
    email: me.email,
    role: me.role,
    tenantId: me.tenantId,
    branchId: me.branchId,
    totpEnabled: me.totpEnabled,
    phone: me.phone,
    lastLoginAt: me.lastLoginAt,
    createdAt: me.createdAt,
    timezone: me.timezone,
    personalTimezone: me.personalTimezone,
    clUserPermissions: me.clUserPermissions,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(authStorage.getAccessToken());
  const [isLoading, setIsLoading] = useState(authStorage.hasTokens());

  useEffect(() => {
    if (!authStorage.hasTokens()) return;

    fetchFullUser()
      .then((fullUser) => {
        if (fullUser) setUser(fullUser);
      })
      .catch(() => {
        authStorage.clearTokens();
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Publish the effective timezone for the non-reactive instant formatters
  // whenever the user changes (login, hydrate, refresh, logout).
  useEffect(() => {
    setDisplayTimezone(user?.timezone ?? PLATFORM_TIMEZONE);
  }, [user]);

  const refreshUser = useCallback(async () => {
    const fullUser = await fetchFullUser();
    if (fullUser) setUser(fullUser);
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
    authStorage.setTokens(data.accessToken, data.refreshToken);
    setToken(data.accessToken);
    setUser(data.user);
    // The login response only carries the minimal user (no timezone); hydrate
    // the full profile without blocking the login flow.
    fetchFullUser()
      .then((fullUser) => {
        if (fullUser) setUser(fullUser);
      })
      .catch(() => {
        // Keep the minimal user; profile fields load on next /v1/me success.
      });
  }, []);

  const logout = useCallback(() => {
    api.POST('/v1/auth/logout').catch(() => {});
    clearPostLoginRedirect();
    authStorage.clearTokens();
    setToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

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
