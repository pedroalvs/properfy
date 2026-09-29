import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

import { api } from '@/services/api';
import { useDisableTotp } from './useDisableTotp';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ error: undefined, response: { status: 204 } });
});

describe('useDisableTotp', () => {
  it('posts the current password to the disable route and succeeds', async () => {
    const { result } = renderHook(() => useDisableTotp());

    let res: { success: boolean } | undefined;
    await act(async () => {
      res = await result.current.disableTotp('CurrentPass1!');
    });

    expect(res?.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/v1/auth/2fa/disable', {
      body: { currentPassword: 'CurrentPass1!' },
    });
  });

  it('returns the error message on failure', async () => {
    mockPost.mockResolvedValueOnce({
      error: { error: { message: 'Current password is incorrect' } },
      response: { status: 400 },
    });
    const { result } = renderHook(() => useDisableTotp());

    let res: { success: boolean; error?: string } | undefined;
    await act(async () => {
      res = await result.current.disableTotp('wrong');
    });

    expect(res?.success).toBe(false);
    expect(res?.error).toBe('Current password is incorrect');
  });
});
