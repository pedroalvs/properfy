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
import { usePropertySummary } from './usePropertySummary';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const SUMMARY = { totalCount: 12, houseCount: 4, apartmentCount: 6 };

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

describe('usePropertySummary', () => {
  it('fetches the summary and returns it', async () => {
    mockGet.mockResolvedValue({ data: { data: SUMMARY } });

    const { result } = renderHook(() => usePropertySummary({}), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.summary).toEqual(SUMMARY));
    expect(result.current.isError).toBe(false);
  });

  it('sends only non-empty filters as query params', async () => {
    mockGet.mockResolvedValue({ data: { data: SUMMARY } });

    renderHook(
      () => usePropertySummary({ tenantId: 'tenant-1', branchId: '', search: 'Main' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const [path, opts] = mockGet.mock.calls[0]!;
    expect(path).toBe('/v1/properties/summary');
    expect(opts.params.query).toEqual({ tenantId: 'tenant-1', search: 'Main' });
  });

  it('exposes isError when the request fails', async () => {
    mockGet.mockResolvedValue({
      error: { error: { code: 'INTERNAL_ERROR', message: 'boom' } },
      response: { status: 500 } as Response,
    });

    const { result } = renderHook(() => usePropertySummary({}), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.summary).toBeNull();
  });
});
