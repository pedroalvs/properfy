import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { api } from '@/services/api';
import { authStorage } from '@/lib/auth-storage';
import { ApiError, toApiError } from '@/lib/api-error';
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

/** TOTP setup material shown in the enrolment wizard. */
export interface TotpSetupData {
  totpUri: string;
  secret: string;
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
  /**
   * Set when a mandatory-2FA account (AM) logged in but still owes enrolment. The
   * staged setup-stage token and password are held in memory (never persisted) so
   * the setup wizard can enrol and then seamlessly re-authenticate.
   */
  pendingTotpSetup: { email: string } | null;
  /** Start enrolment for the pending account: returns the QR/secret to display. */
  setupPendingTotp: () => Promise<TotpSetupData>;
  /** Confirm the code, then mint a full session with the held credentials. */
  confirmPendingTotp: (totpCode: string) => Promise<void>;
  /** Abandon the pending enrolment (e.g. the user signs out of the wizard). */
  cancelTotpSetup: () => void;
}

interface PendingTotpSetupState {
  stagedToken: string;
  email: string;
  password: string;
  /** True once /2fa/confirm succeeded, so a re-login retry does not re-confirm. */
  confirmed: boolean;
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
  const [pendingTotpSetup, setPendingTotpSetup] = useState<{ email: string } | null>(null);
  // Sensitive setup material (staged token + password) lives only in a ref — never
  // in state, storage, or the exposed context — so it never leaks or persists.
  const pendingSetupRef = useRef<PendingTotpSetupState | null>(null);

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
    // The account still owes a 2FA enrolment (AM). The backend issues only a
    // `totp_setup`-stage token, rejected by every protected route, so it must NOT
    // be persisted as a real session. Hold it (and the password) in memory and
    // signal the setup wizard via `pendingTotpSetup`; the wizard enrols and then
    // re-authenticates for a full session.
    if (data.totpSetupRequired) {
      pendingSetupRef.current = {
        stagedToken: data.accessToken,
        email,
        password,
        confirmed: false,
      };
      setPendingTotpSetup({ email });
      return;
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

  const setupPendingTotp = useCallback(async (): Promise<TotpSetupData> => {
    const pending = pendingSetupRef.current;
    if (!pending) {
      throw new ApiError(400, 'No pending 2FA setup', 'AUTH_TOTP_SETUP_REQUIRED');
    }
    const { data, error, response } = await api.POST('/v1/auth/2fa/setup', {
      // The staged token authenticates this call; it is never in authStorage, so
      // the request middleware leaves this explicit header untouched.
      headers: { Authorization: `Bearer ${pending.stagedToken}` },
    });
    if (error) throw toApiError(error, (response as Response | undefined)?.status);
    if (!data) throw new ApiError(500, 'Failed to set up 2FA');
    return { totpUri: data.qrUri, secret: data.secret };
  }, []);

  const confirmPendingTotp = useCallback(
    async (totpCode: string): Promise<void> => {
      const pending = pendingSetupRef.current;
      if (!pending) {
        throw new ApiError(400, 'No pending 2FA setup', 'AUTH_TOTP_SETUP_REQUIRED');
      }
      // Confirm exactly once. If a later re-login fails (e.g. the code rotated in
      // the gap), the account is already enrolled — re-confirming would 409, so a
      // retry must skip straight to re-authentication with a fresh code.
      if (!pending.confirmed) {
        // The generated types don't model this route's body (mirrors useTotpConfirm).
        const { error, response } = await api.POST('/v1/auth/2fa/confirm' as any, {
          body: { totpCode } as any,
          headers: { Authorization: `Bearer ${pending.stagedToken}` },
        });
        if (error) throw toApiError(error, (response as Response | undefined)?.status);
        pending.confirmed = true;
      }
      // Seamless: mint a full session with the held credentials + the just-entered
      // code. On success this sets tokens + user via the normal login path.
      await login(pending.email, pending.password, totpCode);
      pendingSetupRef.current = null;
      setPendingTotpSetup(null);
    },
    [login],
  );

  const cancelTotpSetup = useCallback(() => {
    pendingSetupRef.current = null;
    setPendingTotpSetup(null);
  }, []);

  const logout = useCallback(() => {
    api.POST('/v1/auth/logout').catch(() => {});
    pendingSetupRef.current = null;
    setPendingTotpSetup(null);
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
        pendingTotpSetup,
        setupPendingTotp,
        confirmPendingTotp,
        cancelTotpSetup,
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
