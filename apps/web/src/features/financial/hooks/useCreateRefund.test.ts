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
});
