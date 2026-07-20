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
import { useInvoiceDetail } from './useInvoiceDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_INVOICE = {
  id: 'inv-01',
  inspectorId: 'insp-01',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-15',
  invoiceNumber: null,  invoiceNumberDisplay: null,  periodType: 'FORTNIGHTLY',
  totalAmount: 1800,
  currency: 'AUD',
  status: 'CLOSED',
  fileKey: 'invoices/inv-01.pdf',
  issuedAt: '2026-03-16T10:00:00Z',
  paidAt: null,
  notes: null,
  createdAt: '2026-03-16T10:00:00Z',
  updatedAt: '2026-03-16T10:00:00Z',
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
