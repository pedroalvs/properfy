import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn() },
}));

import { api } from '@/services/api';
import { useInvoiceSummary } from './useInvoiceSummary';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const SUMMARY = {
  currency: 'AUD',
  totalCount: 10,
  pendingCount: 4,
  approvedCount: 3,
  paidCount: 2,
  voidCount: 1,
  pendingAmount: 1200.5,
  paidAmount: 800,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  mockGet.mockReset();
});

describe('useInvoiceSummary', () => {
  it('fetches the summary and returns it', async () => {
    mockGet.mockResolvedValue({ data: { data: SUMMARY } });

    const { result } = renderHook(() => useInvoiceSummary({}), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.summary).toEqual(SUMMARY));
    expect(result.current.multiCurrencyError).toBeNull();
  });

  it('sends only the provided filters as query params', async () => {
    mockGet.mockResolvedValue({ data: { data: SUMMARY } });

    renderHook(
      () =>
        useInvoiceSummary({
          inspectorId: 'insp-1',
          agencyId: '',
          branchId: '',
          fromDate: '2026-04-01',
          toDate: '',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const [path, opts] = mockGet.mock.calls[0]!;
    expect(path).toBe('/v1/billing/invoices/summary');
    expect(opts.params.query).toEqual({ inspectorId: 'insp-1', fromDate: '2026-04-01' });
  });

  it('exposes a multiCurrencyError on MULTI_CURRENCY_SCOPE and takes the status from the Response', async () => {
    mockGet.mockResolvedValue({
      // The parsed error body carries no HTTP status — it lives on the raw Response.
      error: {
        error: {
          code: 'MULTI_CURRENCY_SCOPE',
          message: 'Multiple currencies in scope',
          details: { currencies: ['AUD', 'USD'] },
        },
      },
      response: { status: 400 },
    });

    const { result } = renderHook(() => useInvoiceSummary({}), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.multiCurrencyError).not.toBeNull());
    expect(result.current.multiCurrencyError?.currencies).toEqual(['AUD', 'USD']);
    expect(result.current.error?.status).toBe(400);
    expect(result.current.summary).toBeNull();
  });
});
