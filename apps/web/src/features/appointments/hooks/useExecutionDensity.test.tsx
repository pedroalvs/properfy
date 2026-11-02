import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn() },
}));

import { api } from '@/services/api';
import { useExecutionDensity } from './useExecutionDensity';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const RESPONSE = {
  fromDate: '2026-10-06',
  toDate: '2026-11-04',
  gridSizeDegrees: 0.001,
  minCellCount: 1,
  cells: [
    { lat: -33.8685, lng: 151.2095, count: 3 },
    { lat: -33.8695, lng: 151.2105, count: 2 },
    { lat: -33.87, lng: 151.21, count: 1 },
  ],
  cellCount: 3,
  totalExecutions: 6,
  excludedWithoutCoordinates: 0,
  truncated: false,
};

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}
function createWrapper() {
  const queryClient = makeClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
function createWrapperWithClient() {
  const queryClient = makeClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

const base = { enabled: true, fromDate: '2026-10-06', toDate: '2026-11-04' };

describe('useExecutionDensity', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: RESPONSE }, error: undefined });
  });

  it('H1: does not request when disabled', () => {
    renderHook(() => useExecutionDensity({ ...base, enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('H2: requests with default params and no tenant/inspector', async () => {
    const { result } = renderHook(() => useExecutionDensity(base), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith('/v1/map/execution-density', {
      params: { query: { fromDate: '2026-10-06', toDate: '2026-11-04' } },
    });
  });

  it('H3: includes tenantId and inspectorId when provided', async () => {
    const { result } = renderHook(
      () => useExecutionDensity({ ...base, tenantId: 'T1', inspectorId: 'I1' }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith('/v1/map/execution-density', {
      params: { query: { fromDate: '2026-10-06', toDate: '2026-11-04', tenantId: 'T1', inspectorId: 'I1' } },
    });
  });

  it('H4: omits empty-string params', async () => {
    const { result } = renderHook(
      () => useExecutionDensity({ ...base, tenantId: '', inspectorId: '' }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const query = mockGet.mock.calls[0]![1].params.query;
    expect(query).not.toHaveProperty('tenantId');
    expect(query).not.toHaveProperty('inspectorId');
  });

  it('H5: changing the period keeps previous cells during the fetch (keepPreviousData)', async () => {
    const { result, rerender } = renderHook(
      ({ to }) => useExecutionDensity({ ...base, toDate: to }),
      { wrapper: createWrapper(), initialProps: { to: '2026-11-04' } },
    );
    await waitFor(() => expect(result.current.cellCount).toBe(3));

    let resolveSecond: (v: unknown) => void = () => {};
    mockGet.mockReturnValueOnce(new Promise((res) => { resolveSecond = res; }));
    rerender({ to: '2026-11-03' });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    // Previous data is still shown while the new period is in flight.
    expect(result.current.cellCount).toBe(3);
    expect(mockGet).toHaveBeenCalledTimes(2);
    resolveSecond({ data: { data: { ...RESPONSE, cellCount: 1, cells: [RESPONSE.cells[0]] } }, error: undefined });
    await waitFor(() => expect(result.current.cellCount).toBe(1));
  });

  it('H7: uses a stable query key including period, tenant and inspector', async () => {
    const { Wrapper, queryClient } = createWrapperWithClient();
    const { result } = renderHook(
      () => useExecutionDensity({ ...base, tenantId: 'T1' }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(['map', 'execution-density', '2026-10-06', '2026-11-04', 'T1', null]);
  });

  it('H6: error after a successful response yields the empty state (no stale leak)', async () => {
    const { result, rerender } = renderHook(
      ({ to }) => useExecutionDensity({ ...base, toDate: to }),
      { wrapper: createWrapper(), initialProps: { to: '2026-11-04' } },
    );
    await waitFor(() => expect(result.current.cellCount).toBe(3));

    mockGet.mockResolvedValueOnce({
      data: undefined,
      error: { error: { code: 'AUTH_FORBIDDEN', message: 'no' } },
    });
    rerender({ to: '2026-11-03' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.cells).toEqual([]);
    expect(result.current.totalExecutions).toBe(0);
    expect(result.current.cellCount).toBe(0);
    expect(result.current.excludedWithoutCoordinates).toBe(0);
    expect(result.current.truncated).toBe(false);
    expect(result.current.minCellCount).toBe(1);
  });

  it('H8: surfaces cellCount and minCellCount from the response', async () => {
    mockGet.mockResolvedValue({
      data: { data: { ...RESPONSE, minCellCount: 3, cellCount: 3 } },
      error: undefined,
    });
    const { result } = renderHook(() => useExecutionDensity(base), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cellCount).toBe(3);
    expect(result.current.minCellCount).toBe(3);
  });

  it('H9: loading defaults before the first response', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useExecutionDensity(base), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.minCellCount).toBe(1);
    expect(result.current.cellCount).toBe(0);
    expect(result.current.cells).toEqual([]);
  });

  it('H10: exposes errorReason from error.details.reason', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'bad',
          details: { reason: 'PERIOD_NOT_A_PRESET', allowedDays: [7, 30, 90] },
        },
      },
    });
    const { result } = renderHook(() => useExecutionDensity(base), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.errorReason).toBe('PERIOD_NOT_A_PRESET');
  });
});
