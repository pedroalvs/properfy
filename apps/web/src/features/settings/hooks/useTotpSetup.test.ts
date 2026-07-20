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

  it('throws with the backend message on error', async () => {
    mockPost.mockResolvedValueOnce({
      data: undefined,
      error: { error: { message: 'TOTP already enabled' } },
      response: { status: 409 },
    });
    const { result } = renderHook(() => useTotpSetup());

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.setupTotp();
      } catch (err) {
        thrown = err;
      }
    });

    expect((thrown as Error).message).toBe('TOTP already enabled');
    expect(result.current.error).toBe('TOTP already enabled');
  });
});
