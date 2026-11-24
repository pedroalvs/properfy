import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const post = vi.fn();
const get = vi.fn();
vi.mock('@/services/api', () => ({
  api: {
    POST: (...args: unknown[]) => post(...args),
    GET: (...args: unknown[]) => get(...args),
  },
}));

// Mutable so a single test can simulate a preexisting (persisted) session on boot.
let hasTokensValue = false;
let accessTokenValue: string | null = null;
const setTokens = vi.fn();
const clearTokens = vi.fn();
vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: () => accessTokenValue,
    hasTokens: () => hasTokensValue,
    setTokens: (...args: unknown[]) => setTokens(...args),
    clearTokens: (...args: unknown[]) => clearTokens(...args),
  },
}));

import { AuthProvider, useAuth } from './useAuth';

const queryClient = new QueryClient();

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

const INSP_LOGIN = {
  data: {
    accessToken: 'insp-access',
    refreshToken: 'insp-refresh',
    user: { id: 'i1', name: 'Ivy Inspector', email: 'ivy@example.com', role: 'INSP', tenantId: null },
  },
  error: undefined,
  response: { status: 200 },
};

describe('useAuth — inspector web sign-in block', () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
    setTokens.mockReset();
    clearTokens.mockReset();
    hasTokensValue = false;
    accessTokenValue = null;
    get.mockResolvedValue({ data: null });
  });

  it('blocks an INSP login: no session, no persisted tokens, flag raised', async () => {
    post.mockResolvedValueOnce(INSP_LOGIN);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('ivy@example.com', 'password');
    });

    // No inspector token is ever persisted on the web.
    expect(setTokens).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.inspectorBlocked).toBe(true);
  });

  it('blocks an INSP who completes 2FA (the code-verified login response is still guarded)', async () => {
    // The backend verifies the TOTP code INSIDE /v1/auth/login (there is no
    // separate verify-OTP endpoint), so the code-verified session comes back from
    // the same login() call and flows through the same INSP guard.
    const { ApiError } = await import('@/lib/api-error');
    post
      // First attempt (no code): backend demands the 2FA code → login() throws, no tokens.
      .mockResolvedValueOnce({
        data: undefined,
        error: { error: { code: 'AUTH_TOTP_REQUIRED', message: 'TOTP required' } },
        response: { status: 401 },
      })
      // Second attempt (with code): backend verifies and returns the full INSP session.
      .mockResolvedValueOnce(INSP_LOGIN);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await expect(result.current.login('ivy@example.com', 'password')).rejects.toBeInstanceOf(
        ApiError,
      );
    });
    // The TOTP-required step persists nothing and does not yet raise the block.
    expect(setTokens).not.toHaveBeenCalled();
    expect(result.current.inspectorBlocked).toBe(false);

    await act(async () => {
      await result.current.login('ivy@example.com', 'password', '123456');
    });

    // After code verification the INSP is still blocked, with no tokens persisted.
    expect(setTokens).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.inspectorBlocked).toBe(true);
  });

  it('discards a preexisting INSP session on boot and raises the flag', async () => {
    hasTokensValue = true;
    accessTokenValue = 'stale-insp-access';
    get.mockResolvedValueOnce({
      data: { id: 'i1', name: 'Ivy', email: 'ivy@example.com', role: 'INSP', tenantId: null },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(clearTokens).toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.inspectorBlocked).toBe(true);
  });

  it('does not block a non-inspector session on boot', async () => {
    hasTokensValue = true;
    accessTokenValue = 'op-access';
    get.mockResolvedValueOnce({
      data: { id: 'o1', name: 'Op', email: 'op@example.com', role: 'OP', tenantId: null },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    expect(clearTokens).not.toHaveBeenCalled();
    expect(result.current.inspectorBlocked).toBe(false);
  });

  it('dismissInspectorBlock clears the flag (clean login screen), no backend logout call', async () => {
    post.mockResolvedValueOnce(INSP_LOGIN);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('ivy@example.com', 'password');
    });
    expect(result.current.inspectorBlocked).toBe(true);

    act(() => {
      result.current.dismissInspectorBlock();
    });

    expect(result.current.inspectorBlocked).toBe(false);
    // Decision 4: discard the browser session only — never call the logout endpoint.
    expect(post).not.toHaveBeenCalledWith('/v1/auth/logout');
  });
});
