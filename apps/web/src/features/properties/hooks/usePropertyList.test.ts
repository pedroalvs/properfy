import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { PropertyType } from '@properfy/shared';
import { usePropertyList } from './usePropertyList';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePropertyList', () => {
  it('returns mock data after loading resolves', () => {
    const { result } = renderHook(() => usePropertyList());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.length).toBeGreaterThan(0);
  });

  it('initially shows loading then resolves', () => {
    const { result } = renderHook(() => usePropertyList());
    expect(result.current.isLoading).toBe(true);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
  });

  it('filtering by type returns only matching properties', () => {
    const { result } = renderHook(() => usePropertyList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        type: PropertyType.INDUSTRIAL,
      });
    });

    expect(result.current.data.length).toBeGreaterThan(0);
    result.current.data.forEach((prop) => {
      expect(prop.type).toBe(PropertyType.INDUSTRIAL);
    });
  });

  it('search filters by code/street/suburb', () => {
    const { result } = renderHook(() => usePropertyList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        search: 'IMV-001',
      });
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0]?.propertyCode).toBe('IMV-001');
  });

  it('pagination total matches filtered data length', () => {
    const { result } = renderHook(() => usePropertyList());
    act(() => { vi.advanceTimersByTime(300); });

    const total = result.current.pagination.total;
    expect(total).toBeGreaterThan(0);

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        type: PropertyType.INDUSTRIAL,
      });
    });

    expect(result.current.pagination.total).toBeLessThan(total);
  });
});
