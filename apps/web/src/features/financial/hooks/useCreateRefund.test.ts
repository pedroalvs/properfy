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
import { useCreateRefund } from './useCreateRefund';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'new-refund-1' } } });
});

describe('useCreateRefund', () => {
  it('starts with isPending false', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useCreateRefund(), { wrapper });

    expect(result.current.isPending).toBe(false);
  });

  it('calls POST with refund data', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useCreateRefund(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        entryId: 'fin-01',
        description: 'Refund for failed inspection',
        reason: 'Service not executed',
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/v1/financial/entries/fin-01/refund', {
      body: {
        description: 'Refund for failed inspection',
        reason: 'Service not executed',
      },
      headers: {
        'Idempotency-Key': expect.any(String),
      },
    });
  });

  it('handles API error', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { message: 'Server error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useCreateRefund(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          entryId: 'fin-01',
          description: 'Refund for failed inspection',
          reason: 'Test',
        });
      }),
    ).rejects.toBeDefined();
  });

  // HOL-3a: the key must stay stable while one refund is in flight (so a retry
  // after a lost response dedupes) and rotate only once the refund has landed.
  it('reuses the key across a retry of a failed call and rotates only after success', async () => {
    const keyOf = (n: number) =>
      (mockPost.mock.calls[n]![1] as { headers: Record<string, string> }).headers['Idempotency-Key'];
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useCreateRefund(), { wrapper });
    const input = { entryId: 'fin-01', description: 'd', reason: 'r' };

    // 1. First attempt fails — no rotation.
    mockPost.mockResolvedValueOnce({ data: undefined, error: { message: 'boom' } });
    await act(async () => {
      await expect(result.current.mutateAsync(input)).rejects.toBeDefined();
    });

    // 2. Retry of the same refund reuses the key (default mock = success).
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    expect(keyOf(0)).toBe(keyOf(1));

    // 3. After that success, the next refund gets a fresh key.
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    expect(keyOf(2)).not.toBe(keyOf(1));
  });
});
