import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReportType, ReportStatus } from '@properfy/shared';
import { useReportList } from './useReportList';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useReportList', () => {
  it('returns mock data after loading resolves', () => {
    const { result } = renderHook(() => useReportList());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.length).toBeGreaterThan(0);
  });

  it('initially shows loading then resolves', () => {
    const { result } = renderHook(() => useReportList());
    expect(result.current.isLoading).toBe(true);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
  });

  it('filtering by reportType returns only matching reports', () => {
    const { result } = renderHook(() => useReportList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        reportType: ReportType.FINANCIAL_SERVICES,
      });
    });

    expect(result.current.data.length).toBeGreaterThan(0);
    result.current.data.forEach((report) => {
      expect(report.reportType).toBe(ReportType.FINANCIAL_SERVICES);
    });
  });

  it('filtering by status returns only matching reports', () => {
    const { result } = renderHook(() => useReportList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        status: ReportStatus.FAILED,
      });
    });

    expect(result.current.data.length).toBeGreaterThan(0);
    result.current.data.forEach((report) => {
      expect(report.status).toBe(ReportStatus.FAILED);
    });
  });
});
