import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

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
import { useFinancialSummary } from './useFinancialSummary';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_SUMMARY = {
  totalDebits: 5000,
  totalPayouts: 3000,
  totalAdjustments: 200,
  totalRefunds: 150,
  pendingCount: 7,
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_SUMMARY } });
});

describe('useFinancialSummary', () => {
  it('returns summary data after loading', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialSummary(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.summary).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toEqual(MOCK_SUMMARY);
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialSummary(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/financial/entries/summary', expect.any(Object));
  });

  it('returns null summary on error', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Server error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialSummary(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toBeNull();
  });
});
