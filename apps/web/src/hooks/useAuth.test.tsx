import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const post = vi.fn();
const get = vi.fn();
vi.mock('@/services/api', () => ({
  api: {
    POST: (...args: unknown[]) => post(...args),
    GET: (...args: unknown[]) => get(...args),
  },
}));

const setTokens = vi.fn();
const clearTokens = vi.fn();
vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: () => null,
    hasTokens: () => false,
    setTokens: (...args: unknown[]) => setTokens(...args),
    clearTokens: (...args: unknown[]) => clearTokens(...args),
  },
}));

import { AuthProvider, useAuth } from './useAuth';
import { ApiError } from '@/lib/api-error';

const queryClient = new QueryClient();

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

const AM_SETUP_LOGIN = {
  data: {
    accessToken: 'setup-stage-token',
    refreshToken: 'refresh',
    totpSetupRequired: true,
    user: { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'AM', tenantId: null },
  },
  error: undefined,
  response: { status: 200 },
};

describe('useAuth.login — 2FA setup pending (BUG-3)', () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
    setTokens.mockReset();
    clearTokens.mockReset();
    get.mockResolvedValue({ data: null });
  });

  it('flags pendingTotpSetup and holds the staged session in memory instead of persisting or throwing', async () => {
    post.mockResolvedValueOnce(AM_SETUP_LOGIN);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('admin@example.com', 'password');
    });

    expect(result.current.pendingTotpSetup).toEqual({ email: 'admin@example.com' });
    // The setup-stage token is rejected by every protected route; persisting it
    // would authenticate the user and then silently bounce them to /login.
    expect(setTokens).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('persists tokens on a normal login (no 2FA setup pending)', async () => {
    post.mockResolvedValueOnce({
      data: {
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'u1', name: 'Op', email: 'op@example.com', role: 'OP', tenantId: null },
      },
      error: undefined,
      response: { status: 200 },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('op@example.com', 'password');
    });

    expect(setTokens).toHaveBeenCalledWith('access', 'refresh');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.pendingTotpSetup).toBeNull();
  });

  it('setupPendingTotp calls /2fa/setup with the staged token and returns the QR material', async () => {
    post
      .mockResolvedValueOnce(AM_SETUP_LOGIN)
      .mockResolvedValueOnce({
        data: { secret: 'BASE32SECRET', qrUri: 'otpauth://totp/Properfy' },
        error: undefined,
        response: { status: 200 },
      });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login('admin@example.com', 'password');
    });

    let material: { totpUri: string; secret: string } | undefined;
    await act(async () => {
      material = await result.current.setupPendingTotp();
    });

    expect(material).toEqual({ totpUri: 'otpauth://totp/Properfy', secret: 'BASE32SECRET' });
    const setupCall = post.mock.calls[1];
    expect(setupCall[0]).toBe('/v1/auth/2fa/setup');
    expect(setupCall[1].headers.Authorization).toBe('Bearer setup-stage-token');
  });

  it('confirmPendingTotp confirms then seamlessly re-authenticates into a full session', async () => {
    post
      .mockResolvedValueOnce(AM_SETUP_LOGIN) // login (setup pending)
      .mockResolvedValueOnce({ error: undefined, response: { status: 204 } }) // confirm
      .mockResolvedValueOnce({
        data: {
          accessToken: 'real-access',
          refreshToken: 'real-refresh',
          user: { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'AM', tenantId: null },
        },
        error: undefined,
        response: { status: 200 },
      }); // re-login

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login('admin@example.com', 'password');
    });

    await act(async () => {
      await result.current.confirmPendingTotp('123456');
    });

    const confirmCall = post.mock.calls[1];
    expect(confirmCall[0]).toBe('/v1/auth/2fa/confirm');
    expect(confirmCall[1].body).toEqual({ totpCode: '123456' });
    expect(confirmCall[1].headers.Authorization).toBe('Bearer setup-stage-token');
    // Re-login used the held credentials + the entered code.
    expect(post.mock.calls[2][0]).toBe('/v1/auth/login');
    expect(post.mock.calls[2][1].body).toEqual({
      email: 'admin@example.com',
      password: 'password',
      totpCode: '123456',
    });
    expect(setTokens).toHaveBeenCalledWith('real-access', 'real-refresh');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.pendingTotpSetup).toBeNull();
  });

  it('does not re-confirm on retry when the re-login code has rotated', async () => {
    post
      .mockResolvedValueOnce(AM_SETUP_LOGIN) // login (setup pending)
      .mockResolvedValueOnce({ error: undefined, response: { status: 204 } }) // confirm (once)
      .mockResolvedValueOnce({
        data: undefined,
        error: { error: { code: 'AUTH_TOTP_INVALID', message: 'Invalid code' } },
        response: { status: 401 },
      }) // re-login fails (code rotated)
      .mockResolvedValueOnce({
        data: {
          accessToken: 'real-access',
          refreshToken: 'real-refresh',
          user: { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'AM', tenantId: null },
        },
        error: undefined,
        response: { status: 200 },
      }); // re-login retry succeeds

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login('admin@example.com', 'password');
    });

    await act(async () => {
      await expect(result.current.confirmPendingTotp('111111')).rejects.toBeInstanceOf(ApiError);
    });
    // Still pending — enrolment happened but the session was not minted.
    expect(result.current.pendingTotpSetup).toEqual({ email: 'admin@example.com' });

    await act(async () => {
      await result.current.confirmPendingTotp('222222');
    });

    // /2fa/confirm was called exactly once across both attempts.
    const confirmCalls = post.mock.calls.filter((c) => c[0] === '/v1/auth/2fa/confirm');
    expect(confirmCalls).toHaveLength(1);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.pendingTotpSetup).toBeNull();
  });

  it('cancelTotpSetup clears the pending state', async () => {
    post.mockResolvedValueOnce(AM_SETUP_LOGIN);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login('admin@example.com', 'password');
    });
    expect(result.current.pendingTotpSetup).not.toBeNull();

    act(() => {
      result.current.cancelTotpSetup();
    });
    expect(result.current.pendingTotpSetup).toBeNull();
  });
});
