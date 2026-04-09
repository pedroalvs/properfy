import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

import { useUrlFilters, type FilterSchema } from '../useUrlFilters';

const schema: FilterSchema = {
  search: { type: 'string', default: '' },
  page: { type: 'number', default: 1 },
  active: { type: 'boolean', default: false },
};

describe('useUrlFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSetSearchParams.mockClear();
    // Reset search params
    for (const key of [...mockSearchParams.keys()]) {
      mockSearchParams.delete(key);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns default values when URL has no params', () => {
    const { result } = renderHook(() => useUrlFilters(schema));
    const [filters] = result.current;

    expect(filters.search).toBe('');
    expect(filters.page).toBe(1);
    expect(filters.active).toBe(false);
  });

  it('deserializes string params from URL', () => {
    mockSearchParams.set('search', 'hello');
    const { result } = renderHook(() => useUrlFilters(schema));
    const [filters] = result.current;

    expect(filters.search).toBe('hello');
  });

  it('deserializes number params from URL', () => {
    mockSearchParams.set('page', '3');
    const { result } = renderHook(() => useUrlFilters(schema));
    const [filters] = result.current;

    expect(filters.page).toBe(3);
  });

  it('deserializes boolean params from URL', () => {
    mockSearchParams.set('active', 'true');
    const { result } = renderHook(() => useUrlFilters(schema));
    const [filters] = result.current;

    expect(filters.active).toBe(true);
  });

  it('falls back to default for invalid number', () => {
    mockSearchParams.set('page', 'abc');
    const { result } = renderHook(() => useUrlFilters(schema));
    const [filters] = result.current;

    expect(filters.page).toBe(1);
  });

  it('falls back to default for invalid boolean', () => {
    mockSearchParams.set('active', 'maybe');
    const { result } = renderHook(() => useUrlFilters(schema));
    const [filters] = result.current;

    expect(filters.active).toBe(false);
  });

  it('calls setSearchParams with debounce when setting a filter', () => {
    const { result } = renderHook(() => useUrlFilters(schema));
    const [, setFilter] = result.current;

    act(() => {
      setFilter('search', 'test');
    });

    expect(mockSetSearchParams).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
    const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(params.get('search')).toBe('test');
  });

  it('removes param from URL when set to default value', () => {
    mockSearchParams.set('search', 'hello');
    const { result } = renderHook(() => useUrlFilters(schema));
    const [, setFilter] = result.current;

    act(() => {
      setFilter('search', '');
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
    const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(params.has('search')).toBe(false);
  });

  it('clears all filters immediately (no debounce)', () => {
    mockSearchParams.set('search', 'hello');
    mockSearchParams.set('page', '5');
    const { result } = renderHook(() => useUrlFilters(schema));
    const [, , clearFilters] = result.current;

    act(() => {
      clearFilters();
    });

    expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
    const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams;
    expect([...params.keys()]).toHaveLength(0);
  });
});
