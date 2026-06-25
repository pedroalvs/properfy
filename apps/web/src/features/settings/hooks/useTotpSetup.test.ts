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
import { useTotpSetup } from './useTotpSetup';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { data: { totpUri: 'otpauth://totp/Properfy:test@test.com?secret=ABC123', secret: 'ABC123' } } });
});

describe('useTotpSetup', () => {
  it('returns TOTP data on successful setup', async () => {
    const { result } = renderHook(() => useTotpSetup());

    let data: unknown;
    await act(async () => {
      data = await result.current.setupTotp();
    });

    expect(data).toEqual({ totpUri: expect.stringContaining('otpauth://'), secret: 'ABC123' });
  });

  it('returns null on error', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { error: { message: 'Server error' } } });
    const { result } = renderHook(() => useTotpSetup());

    let data: unknown;
    await act(async () => {
      data = await result.current.setupTotp();
    });

    expect(data).toBeNull();
    expect(result.current.error).toBe('Server error');
  });
});
