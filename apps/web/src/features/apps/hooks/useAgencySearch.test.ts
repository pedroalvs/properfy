import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useAgencySearch } from './useAgencySearch';

vi.mock('@/services/api', () => ({ api: { GET: vi.fn() } }));

// The typed openapi-fetch overloads collapse mock.calls to `never`; this is the
// shape we actually record for the /v1/tenants query.
type GetOptions = { params: { query: Record<string, unknown> } };

function paginated(rows: { id: string; name: string }[], total: number) {
  return {
    data: { data: rows, pagination: { page: 1, pageSize: 100, total, totalPages: 1 } },
    error: undefined,
  };
}

describe('useAgencySearch', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    const { api } = await import('@/services/api');
    vi.mocked(api.GET).mockResolvedValue(paginated([], 0) as never);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('requests the first 100 agencies alphabetically with no search on mount', async () => {
    const { api } = await import('@/services/api');
    renderHook(() => useAgencySearch(true), { wrapper: createQueryWrapper() });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(api.GET).toHaveBeenCalledWith(
      '/v1/tenants',
      expect.objectContaining({
        params: { query: expect.objectContaining({ pageSize: '100', sortBy: 'name', sortOrder: 'asc' }) },
      }),
    );
    // Empty search must not be sent as a param.
    const firstCall = vi.mocked(api.GET).mock.calls[0]! as unknown as [string, GetOptions];
    expect(firstCall[1].params.query).not.toHaveProperty('search');
  });

  it('sends the debounced search term (300ms) as the `search` query param', async () => {
    const { api } = await import('@/services/api');
    const { result } = renderHook(() => useAgencySearch(true), { wrapper: createQueryWrapper() });

    act(() => {
      result.current.setSearch('acme');
    });
    // Before the debounce elapses, no request carries the term.
    const callsSoFar = vi.mocked(api.GET).mock.calls as unknown as [string, GetOptions][];
    expect(callsSoFar.some((c) => c[1].params.query?.['search'] === 'acme')).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await vi.runAllTimersAsync();
    });

    expect(api.GET).toHaveBeenCalledWith(
      '/v1/tenants',
      expect.objectContaining({
        params: { query: expect.objectContaining({ search: 'acme', pageSize: '100' }) },
      }),
    );
  });

  it('exposes results and total from the paginated response', async () => {
    const { api } = await import('@/services/api');
    vi.mocked(api.GET).mockResolvedValue(
      paginated([{ id: 't1', name: 'Acme' }], 250) as never,
    );
    const { result } = renderHook(() => useAgencySearch(true), { wrapper: createQueryWrapper() });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.total).toBe(250);
    expect(result.current.results).toEqual([{ id: 't1', name: 'Acme' }]);
  });
});
