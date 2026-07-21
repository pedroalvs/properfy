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

import { api } from '@/services/api';
import { useFinancialList } from './useFinancialList';
import { createRouterQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_ENTRIES = [
  { id: 'fin-01', entryType: 'TENANT_DEBIT', appointmentCode: 'VIST-001', description: 'Debit' },
  { id: 'fin-02', entryType: 'INSPECTOR_PAYOUT', appointmentCode: 'VIST-002', description: 'Payout' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_ENTRIES,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

describe('useFinancialList', () => {
  it('returns data after loading resolves', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useFinancialList(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
  });

  it('initially shows loading then resolves', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useFinancialList(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('calls API with correct path', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useFinancialList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/financial/entries', { params: { query: expect.any(Object) } });
  });

  it('maps entryType filter to backend type param and does not send search', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useFinancialList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    result.current.setFilters({ entryType: 'REFUND', status: 'PENDING' });

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith('/v1/financial/entries', {
        params: {
          query: expect.objectContaining({
            type: 'REFUND',
            status: 'PENDING',
          }),
        },
      });
    });

    const lastCall = mockGet.mock.calls.at(-1)?.[1];
    expect(lastCall?.params?.query).not.toHaveProperty('entryType');
    expect(lastCall?.params?.query).not.toHaveProperty('search');
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useFinancialList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useFinancialList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('initializes supported filters from query params', async () => {
    const wrapper = createRouterQueryWrapper('/financial?type=REFUND&status=PENDING');
    const { result } = renderHook(() => useFinancialList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.filters.entryType).toBe('REFUND');
    expect(result.current.filters.status).toBe('PENDING');
    expect(mockGet).toHaveBeenCalledWith('/v1/financial/entries', {
      params: {
        query: expect.objectContaining({
          type: 'REFUND',
          status: 'PENDING',
        }),
      },
    });
  });
});
