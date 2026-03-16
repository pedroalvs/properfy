import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ServiceGroupStatus } from '@properfy/shared';
import { useServiceGroupList } from './useServiceGroupList';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useServiceGroupList', () => {
  it('returns mock data after loading resolves', () => {
    const { result } = renderHook(() => useServiceGroupList());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.length).toBeGreaterThan(0);
  });

  it('initially shows loading then resolves', () => {
    const { result } = renderHook(() => useServiceGroupList());
    expect(result.current.isLoading).toBe(true);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
  });

  it('filtering by status returns only matching service groups', () => {
    const { result } = renderHook(() => useServiceGroupList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        status: ServiceGroupStatus.DRAFT,
      });
    });

    expect(result.current.data.length).toBeGreaterThan(0);
    result.current.data.forEach((sg) => {
      expect(sg.status).toBe(ServiceGroupStatus.DRAFT);
    });
  });

  it('search filters by name/regionName/inspectorName', () => {
    const { result } = renderHook(() => useServiceGroupList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        search: 'carlos',
      });
    });

    expect(result.current.data.length).toBeGreaterThan(0);
    expect(result.current.data[0]?.inspectorName).toBe('Carlos Silva');
  });

  it('pagination total matches filtered data length', () => {
    const { result } = renderHook(() => useServiceGroupList());
    act(() => { vi.advanceTimersByTime(300); });

    const total = result.current.pagination.total;
    expect(total).toBeGreaterThan(0);

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        status: ServiceGroupStatus.CANCELLED,
      });
    });

    expect(result.current.pagination.total).toBeLessThan(total);
  });
});
