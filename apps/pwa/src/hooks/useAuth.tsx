import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { env } from '@/config/env';
import { authStorage } from '@/lib/auth-storage';
import { ApiError } from '@/lib/api-error';
import { UserRole } from '@properfy/shared';
import { clearPostLoginRedirect } from '@/lib/post-login-redirect';
import { clearAllLocalData } from '@/features/execution/lib/indexeddb';
import { resetQueueSnapshot } from '@/features/execution/hooks/useOfflineQueue';

// The two NetworkFirst runtime caches that hold per-inspector API responses
// (see src/sw/runtime-caching.ts). Font/static caches are not inspector data
// and are left. Exported so the service worker's runtime-caching descriptor can
// assert the names stay in sync (a new inspector cache must be added here).
export const INSPECTOR_API_CACHES = ['api-schedule-cache', 'api-appointment-cache'];

/**
 * Best-effort wipe of every trace of the inspector's data on logout so a shared
 * contractor device never serves the previous inspector's cached schedule,
 * appointments, queued actions or execution drafts to the next login (PWA-7).
 */
function clearInspectorCachedData(): void {
  if (typeof caches !== 'undefined') {
    void Promise.all(
      INSPECTOR_API_CACHES.map((name) => caches.delete(name).catch(() => false)),
    );
  }
  void clearAllLocalData().catch(() => {});
  resetQueueSnapshot();
}

/**
 * Fire-and-forget: unregister this device's push subscription on the server and
 * locally, so the next inspector on a shared device does not keep receiving the
 * previous one's push. The access token is passed explicitly because `logout`
 * clears it synchronously right after calling this — the api client's middleware
 * would otherwise read an already-cleared token. Every error is swallowed; the
 * server also revokes the endpoint on the next 410.
 */
function unsubscribeThisDevice(token: string | null): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void (async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return;
      try {
        // Only the server POST needs the token. Without one (tokens already
        // cleared) we skip it but STILL drop the local subscription, so this
        // device never keeps delivering push to the next inspector on a shared
        // device — the server revokes the stale endpoint on its next 410.
        if (token) {
          await fetch(`${env.apiBaseUrl}/v1/inspectors/me/push-subscriptions/unsubscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
        }
      } finally {
        await subscription.unsubscribe();
      }
    } catch {
      // Best effort only.
    }
  })();
}

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
  /** Effective IANA timezone (personal ?? platform), from /v1/me. */
  timezone?: string | null;
  /** Raw personal timezone (users.timezone); null when unset. */
  personalTimezone?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  logout: (options?: { keepPushSubscription?: boolean }) => void;
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

async function fetchFullUser(): Promise<AuthUser | null> {
  const { data } = await api.GET('/v1/me');
  if (!data) return null;

  const me = data as typeof data & {
    status?: string;
    phone?: string | null;
    totpEnabled?: boolean;
    lastLoginAt?: string | null;
    inspectorId?: string | null;
    inspectorPhotoUrl?: string | null;
    timezone?: string | null;
    personalTimezone?: string | null;
  };
  return normalizePwaUser({
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
    timezone: me.timezone ?? null,
    personalTimezone: me.personalTimezone ?? null,
  });
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
      // The login response only carries the minimal user; hydrate the extended
      // fields (phone, inspectorId, photo, 2FA) without blocking the login.
      try {
        const fullUser = await fetchFullUser();
        if (fullUser) setUser(fullUser);
      } catch {
        // Keep the minimal user; profile fields load on next /v1/me success.
      }
    } catch (roleError) {
      authStorage.clearTokens();
      clearPostLoginRedirect();
      setToken(null);
      setUser(null);
      throw roleError;
    }
  }, []);

  const logout = useCallback((options?: { keepPushSubscription?: boolean }) => {
    // Capture the access token BEFORE clearing it; the device unsubscribe runs
    // fire-and-forget and needs an explicit Bearer. A password change keeps the
    // subscription (same inspector re-logs in on the same device).
    if (!options?.keepPushSubscription) {
      unsubscribeThisDevice(authStorage.getAccessToken());
    }
    api.POST('/v1/auth/logout').catch(() => {});
    clearPostLoginRedirect();
    authStorage.clearTokens();
    setToken(null);
    setUser(null);
    // Drop in-memory React Query state plus the SW caches and IndexedDB stores so
    // nothing of this inspector survives for the next login on a shared device.
    queryClient.clear();
    clearInspectorCachedData();
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    const fullUser = await fetchFullUser();
    if (fullUser) setUser(fullUser);
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
