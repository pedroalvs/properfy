import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFinancialEntryDetail } from './useFinancialEntryDetail';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFinancialEntryDetail', () => {
  it('returns entry by id', () => {
    const { result } = renderHook(() => useFinancialEntryDetail('fin-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.entry?.appointmentCode).toBe('VIST-001');
  });

  it('returns null for unknown id', () => {
    const { result } = renderHook(() => useFinancialEntryDetail('unknown'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.entry).toBeNull();
  });

  it('returns null when id is null', () => {
    const { result } = renderHook(() => useFinancialEntryDetail(null));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.entry).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const { result } = renderHook(() => useFinancialEntryDetail('fin-01'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.entry).toBeNull();
  });

  it('refetch triggers reload', () => {
    const { result } = renderHook(() => useFinancialEntryDetail('fin-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.entry?.appointmentCode).toBe('VIST-001');
    act(() => { result.current.refetch(); });
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.entry?.appointmentCode).toBe('VIST-001');
  });
});
