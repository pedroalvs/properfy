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
import { useInvoiceList } from './useInvoiceList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_INVOICES = [
  { id: 'inv-01', inspectorId: 'insp-01', periodStart: '2026-03-01', periodEnd: '2026-03-15', periodType: 'FORTNIGHTLY', totalAmount: 1800, currency: 'AUD', status: 'CLOSED', fileKey: 'invoices/inv-01.pdf', issuedAt: '2026-03-16T10:00:00Z', paidAt: null, createdAt: '2026-03-16T10:00:00Z' },
  { id: 'inv-02', inspectorId: 'insp-02', periodStart: '2026-03-01', periodEnd: '2026-03-31', periodType: 'MONTHLY', totalAmount: 3200, currency: 'AUD', status: 'PAID', fileKey: 'invoices/inv-02.pdf', issuedAt: '2026-03-16T10:00:00Z', paidAt: '2026-03-20T10:00:00Z', createdAt: '2026-03-16T10:00:00Z' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_INVOICES,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

describe('useInvoiceList', () => {
  it('returns data after loading resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInvoiceList(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInvoiceList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/billing/invoices', { params: { query: expect.any(Object) } });
  });

  it('does not send unsupported sort params and uses inspectorId when selected', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInvoiceList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    result.current.setFilters({
      ...result.current.filters,
      inspectorId: '123e4567-e89b-12d3-a456-426614174000',
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith('/v1/billing/invoices', {
        params: {
          query: expect.objectContaining({
            inspectorId: '123e4567-e89b-12d3-a456-426614174000',
          }),
        },
      });
    });

    const lastCall = mockGet.mock.calls.at(-1)?.[1];
    expect(lastCall?.params?.query).not.toHaveProperty('sortBy');
    expect(lastCall?.params?.query).not.toHaveProperty('sortOrder');
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInvoiceList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInvoiceList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });
});
