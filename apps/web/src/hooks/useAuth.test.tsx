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

describe('useAuth.login — 2FA setup pending (BUG-3)', () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
    setTokens.mockReset();
    clearTokens.mockReset();
  });

  it('does not persist tokens and throws AUTH_TOTP_SETUP_REQUIRED when the response flags totpSetupRequired', async () => {
    post.mockResolvedValueOnce({
      data: {
        accessToken: 'setup-stage-token',
        refreshToken: 'refresh',
        totpSetupRequired: true,
        user: { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'AM', tenantId: null },
      },
      error: undefined,
      response: { status: 200 },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.login('admin@example.com', 'password');
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe('AUTH_TOTP_SETUP_REQUIRED');
    // The setup-stage token is rejected by every protected route; storing it would
    // authenticate the user and then silently bounce them back to /login.
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
    // Background profile hydration (/v1/me) is a no-op for this test.
    get.mockResolvedValueOnce({ data: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('op@example.com', 'password');
    });

    expect(setTokens).toHaveBeenCalledWith('access', 'refresh');
    expect(result.current.isAuthenticated).toBe(true);
  });
});
