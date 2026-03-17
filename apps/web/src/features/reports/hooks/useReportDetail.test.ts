import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReportDetail } from './useReportDetail';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useReportDetail', () => {
  it('returns report by id', () => {
    const { result } = renderHook(() => useReportDetail('rpt-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.report?.requestedByName).toBe('Admin Principal');
  });

  it('returns null for unknown id', () => {
    const { result } = renderHook(() => useReportDetail('unknown'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.report).toBeNull();
  });

  it('returns null when id is null', () => {
    const { result } = renderHook(() => useReportDetail(null));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.report).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const { result } = renderHook(() => useReportDetail('rpt-01'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.report).toBeNull();
  });

  it('refetch triggers reload', () => {
    const { result } = renderHook(() => useReportDetail('rpt-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.report?.requestedByName).toBe('Admin Principal');
    act(() => { result.current.refetch(); });
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.report?.requestedByName).toBe('Admin Principal');
  });
});
