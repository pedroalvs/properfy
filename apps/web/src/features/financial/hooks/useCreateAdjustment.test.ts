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
import { useCreateAdjustment } from './useCreateAdjustment';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'new-adj-1' } } });
});

describe('useCreateAdjustment', () => {
  it('starts with isPending false', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useCreateAdjustment(), { wrapper });

    expect(result.current.isPending).toBe(false);
  });

  it('calls POST with adjustment data', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useCreateAdjustment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        amount: 100,
        effectiveAt: '2026-03-15T00:00:00.000Z',
        notes: 'Test adjustment note',
        entryType: 'MANUAL_ADJUSTMENT',
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/v1/financial/entries', {
      body: {
        amount: 100,
        effectiveAt: '2026-03-15T00:00:00.000Z',
        notes: 'Test adjustment note',
        entryType: 'MANUAL_ADJUSTMENT',
      },
      headers: {
        'Idempotency-Key': expect.any(String),
      },
    });
  });

  it('handles API error', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { message: 'Bad request' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useCreateAdjustment(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          amount: 100,
          effectiveAt: '2026-03-15T00:00:00.000Z',
          notes: 'Test note',
          entryType: 'MANUAL_ADJUSTMENT',
        });
      }),
    ).rejects.toBeDefined();
  });
});
