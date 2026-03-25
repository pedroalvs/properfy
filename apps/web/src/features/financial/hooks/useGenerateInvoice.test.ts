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
import { useGenerateInvoice } from './useGenerateInvoice';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { data: { id: 'inv-new-01' } } });
});

describe('useGenerateInvoice', () => {
  it('starts with isPending false', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useGenerateInvoice(), { wrapper });

    expect(result.current.isPending).toBe(false);
  });

  it('calls POST with generate data', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useGenerateInvoice(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        inspectorId: 'insp-01',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        periodType: 'MONTHLY',
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/v1/billing/invoices/generate', {
        body: {
          inspectorId: 'insp-01',
          periodStart: '2026-03-01',
          periodEnd: '2026-03-31',
          periodType: 'MONTHLY',
        },
      });
  });

  it('handles API error', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { message: 'Bad request' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useGenerateInvoice(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          inspectorId: 'insp-01',
          periodStart: '2026-03-01',
          periodEnd: '2026-03-31',
          periodType: 'MONTHLY',
        });
      }),
    ).rejects.toBeDefined();
  });
});
