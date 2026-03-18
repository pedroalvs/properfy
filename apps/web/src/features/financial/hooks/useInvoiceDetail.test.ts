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
import { useInvoiceDetail } from './useInvoiceDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_INVOICE = {
  id: 'inv-01',
  inspectorName: 'Diego',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-15',
  frequency: 'BIWEEKLY',
  totalAmount: 1800,
  currency: 'BRL',
  status: 'DRAFT',
  entryCount: 5,
  entries: [],
  downloadUrl: null,
  notes: null,
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_INVOICE } });
});

describe('useInvoiceDetail', () => {
  it('returns null when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInvoiceDetail(null), { wrapper });

    expect(result.current.invoice).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('returns invoice data after loading', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInvoiceDetail('inv-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.invoice).toEqual(MOCK_INVOICE);
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInvoiceDetail('inv-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/billing/invoices/inv-01', expect.any(Object));
  });
});
