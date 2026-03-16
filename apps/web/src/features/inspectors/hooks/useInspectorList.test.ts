import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { InspectorStatus } from '@properfy/shared';
import { useInspectorList } from './useInspectorList';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useInspectorList', () => {
  it('returns mock data after loading resolves', () => {
    const { result } = renderHook(() => useInspectorList());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.length).toBeGreaterThan(0);
  });

  it('initially shows loading then resolves', () => {
    const { result } = renderHook(() => useInspectorList());
    expect(result.current.isLoading).toBe(true);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
  });

  it('filtering by status returns only matching inspectors', () => {
    const { result } = renderHook(() => useInspectorList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        status: InspectorStatus.INACTIVE,
      });
    });

    expect(result.current.data.length).toBeGreaterThan(0);
    result.current.data.forEach((insp) => {
      expect(insp.status).toBe(InspectorStatus.INACTIVE);
    });
  });

  it('search filters by name/email/phone', () => {
    const { result } = renderHook(() => useInspectorList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        search: 'carlos',
      });
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0]?.name).toBe('Carlos Silva');
  });

  it('pagination total matches filtered data length', () => {
    const { result } = renderHook(() => useInspectorList());
    act(() => { vi.advanceTimersByTime(300); });

    const total = result.current.pagination.total;
    expect(total).toBeGreaterThan(0);

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        status: InspectorStatus.INACTIVE,
      });
    });

    expect(result.current.pagination.total).toBeLessThan(total);
  });
});
