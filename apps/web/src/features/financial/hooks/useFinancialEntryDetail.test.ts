import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { apiClient } from '@/lib/api-client';
import { useFinancialEntryDetail } from './useFinancialEntryDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_ENTRY = {
  id: 'fin-01',
  entryType: 'TENANT_DEBIT',
  appointmentCode: 'VIST-001',
  description: 'Debit entry',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: MOCK_ENTRY });
});

describe('useFinancialEntryDetail', () => {
  it('returns entry by id', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntryDetail('fin-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.entry?.appointmentCode).toBe('VIST-001');
  });

  it('returns null when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntryDetail(null), { wrapper });

    expect(result.current.entry).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntryDetail('fin-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.entry).toBeNull();
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntryDetail('fin-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/financial/entries/fin-01');
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValueOnce(new Error('Not found'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntryDetail('fin-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.entry).toBeNull();
  });
});
