import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { api } from '@/services/api';
import { useTotpConfirm } from './useTotpConfirm';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { success: true } });
});

describe('useTotpConfirm', () => {
  it('returns success on valid code', async () => {
    const { result } = renderHook(() => useTotpConfirm());

    let res: { success: boolean } | undefined;
    await act(async () => {
      res = await result.current.confirmTotp('123456');
    });

    expect(res?.success).toBe(true);
    expect(mockPost).toHaveBeenCalled();
  });

  it('returns failure on API error', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { error: { message: 'Invalid code' } } });
    const { result } = renderHook(() => useTotpConfirm());

    let res: { success: boolean; error?: string } | undefined;
    await act(async () => {
      res = await result.current.confirmTotp('000000');
    });

    expect(res?.success).toBe(false);
    expect(res?.error).toBe('Invalid code');
  });
});
