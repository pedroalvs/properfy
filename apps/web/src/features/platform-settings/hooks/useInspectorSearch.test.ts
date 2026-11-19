import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const usePaginatedQuery = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({
  usePaginatedQuery: (...args: unknown[]) => usePaginatedQuery(...args),
}));

import { useInspectorSearch } from './useInspectorSearch';

function lastParams() {
  const calls = usePaginatedQuery.mock.calls;
  return calls[calls.length - 1]?.[2] as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers();
  usePaginatedQuery.mockReset();
  usePaginatedQuery.mockReturnValue({ data: { data: [], pagination: { total: 0 } }, isLoading: false });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useInspectorSearch', () => {
  it('queries ACTIVE inspectors with pageSize 20 and no search initially', () => {
    renderHook(() => useInspectorSearch(true));
    const params = lastParams();
    expect(params.status).toBe('ACTIVE');
    expect(params.pageSize).toBe(20);
    expect(params.search).toBeUndefined();
    // Never a 100-row fetch (L-F04-14).
    expect(params.pageSize).not.toBe(100);
  });

  it('debounces the search by 300 ms before issuing search=jan', () => {
    const { result } = renderHook(() => useInspectorSearch(true));
    act(() => result.current.setSearch('jan'));
    // Not yet applied.
    expect(lastParams().search).toBeUndefined();
    act(() => vi.advanceTimersByTime(300));
    expect(lastParams()).toMatchObject({ status: 'ACTIVE', pageSize: 20, search: 'jan' });
  });

  it('passes the query key through and surfaces the total', () => {
    usePaginatedQuery.mockReturnValue({
      data: { data: [{ id: 'i1', name: 'Jan Doe' }], pagination: { total: 5 } },
      isLoading: false,
    });
    const { result } = renderHook(() => useInspectorSearch(true));
    expect(result.current.results).toEqual([{ id: 'i1', name: 'Jan Doe' }]);
    expect(result.current.total).toBe(5);
  });
});
