import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

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
import { useFinancialBatchApprove } from './useFinancialBatchApprove';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPatch.mockReset();
  mockPatch.mockResolvedValue({ data: { data: {} } });
});

describe('useFinancialBatchApprove', () => {
  it('starts with isApproving false', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialBatchApprove(), { wrapper });

    expect(result.current.isApproving).toBe(false);
  });

  it('approves all entries successfully', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialBatchApprove(), { wrapper });

    let approveResult: { success: boolean; failedCount: number } | undefined;
    await act(async () => {
      approveResult = await result.current.approve(['id-1', 'id-2']);
    });

    expect(approveResult?.success).toBe(true);
    expect(approveResult?.failedCount).toBe(0);
    expect(mockPatch).toHaveBeenCalledTimes(2);
  });

  it('reports failed entries', async () => {
    mockPatch
      .mockResolvedValueOnce({ data: { data: {} } })
      .mockResolvedValueOnce({ error: { error: { message: 'Failed' } } });

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialBatchApprove(), { wrapper });

    let approveResult: { success: boolean; failedCount: number } | undefined;
    await act(async () => {
      approveResult = await result.current.approve(['id-1', 'id-2']);
    });

    expect(approveResult?.success).toBe(false);
    expect(approveResult?.failedCount).toBe(1);
  });

  it('resets isApproving after completion', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialBatchApprove(), { wrapper });

    await act(async () => {
      await result.current.approve(['id-1']);
    });

    await waitFor(() => {
      expect(result.current.isApproving).toBe(false);
    });
  });
});
