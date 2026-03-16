import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { FinancialEntryType } from '@properfy/shared';
import { useFinancialList } from './useFinancialList';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFinancialList', () => {
  it('returns mock data after loading resolves', () => {
    const { result } = renderHook(() => useFinancialList());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.length).toBeGreaterThan(0);
  });

  it('initially shows loading then resolves', () => {
    const { result } = renderHook(() => useFinancialList());
    expect(result.current.isLoading).toBe(true);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
  });

  it('filtering by entryType returns only matching entries', () => {
    const { result } = renderHook(() => useFinancialList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        entryType: FinancialEntryType.REFUND,
      });
    });

    expect(result.current.data.length).toBeGreaterThan(0);
    result.current.data.forEach((entry) => {
      expect(entry.entryType).toBe(FinancialEntryType.REFUND);
    });
  });

  it('search filters by description/appointmentCode', () => {
    const { result } = renderHook(() => useFinancialList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        search: 'VIST-001',
      });
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0]?.appointmentCode).toBe('VIST-001');
  });

  it('pagination total matches filtered data length', () => {
    const { result } = renderHook(() => useFinancialList());
    act(() => { vi.advanceTimersByTime(300); });

    const total = result.current.pagination.total;
    expect(total).toBeGreaterThan(0);

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        entryType: FinancialEntryType.MANUAL_ADJUSTMENT,
      });
    });

    expect(result.current.pagination.total).toBeLessThan(total);
  });
});
