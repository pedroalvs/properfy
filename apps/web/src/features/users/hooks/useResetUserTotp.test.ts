import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

let mockAuthUser: Record<string, unknown> = { id: 'admin-1', role: 'AM', tenantId: null };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockAuthUser }),
}));

import { api } from '@/services/api';
import { useResetUserTotp } from './useResetUserTotp';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ error: undefined, response: { status: 204 } });
  mockAuthUser = { id: 'admin-1', role: 'AM', tenantId: null };
});

describe('useResetUserTotp', () => {
  it('hits the tenant route for the tenant scope', async () => {
    const { result } = renderHook(() => useResetUserTotp('tenant-9', 'tenant'), { wrapper });

    let res: { success: boolean } | undefined;
    await act(async () => {
      res = await result.current.resetTotp('user-1');
    });

    expect(res?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/tenants/{tenantId}/users/{userId}/2fa/reset', {
      params: { path: { tenantId: 'tenant-9', userId: 'user-1' } },
    });
  });

  it('hits the internal route for the internal scope', async () => {
    const { result } = renderHook(() => useResetUserTotp(undefined, 'internal'), { wrapper });

    await act(async () => {
      await result.current.resetTotp('user-2');
    });

    expect(mockPost).toHaveBeenCalledWith('/v1/users/{userId}/2fa/reset', {
      params: { path: { userId: 'user-2' } },
    });
  });

  it('returns the error message on failure', async () => {
    mockPost.mockResolvedValueOnce({
      error: { error: { message: 'Forbidden' } },
      response: { status: 403 },
    });
    const { result } = renderHook(() => useResetUserTotp(undefined, 'internal'), { wrapper });

    let res: { success: boolean; error?: string } | undefined;
    await act(async () => {
      res = await result.current.resetTotp('user-3');
    });

    expect(res?.success).toBe(false);
    expect(res?.error).toBe('Forbidden');
  });
});
