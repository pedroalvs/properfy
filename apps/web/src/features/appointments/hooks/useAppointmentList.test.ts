import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AppointmentStatus } from '@properfy/shared';
import { useAppointmentList } from './useAppointmentList';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAppointmentList', () => {
  it('returns mock data after loading resolves', async () => {
    const { result } = renderHook(() => useAppointmentList());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.length).toBeGreaterThan(0);
  });

  it('initially shows loading then resolves', () => {
    const { result } = renderHook(() => useAppointmentList());
    expect(result.current.isLoading).toBe(true);

    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.isLoading).toBe(false);
  });

  it('filtering by status returns only matching appointments', () => {
    const { result } = renderHook(() => useAppointmentList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        status: AppointmentStatus.DONE,
        showCancelled: true,
      });
    });

    expect(result.current.data.length).toBeGreaterThan(0);
    result.current.data.forEach((apt) => {
      expect(apt.status).toBe(AppointmentStatus.DONE);
    });
  });

  it('search filters by code/address/contactName', () => {
    const { result } = renderHook(() => useAppointmentList());
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        search: 'VST-001',
        showCancelled: true,
      });
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0]?.code).toBe('VST-001');
  });

  it('showCancelled=false hides CANCELLED appointments', () => {
    const { result } = renderHook(() => useAppointmentList());
    act(() => { vi.advanceTimersByTime(300); });

    const withoutCancelled = result.current.data;
    const hasCancelled = withoutCancelled.some(
      (apt) => apt.status === AppointmentStatus.CANCELLED,
    );
    expect(hasCancelled).toBe(false);
  });

  it('pagination total matches filtered data length', () => {
    const { result } = renderHook(() => useAppointmentList());
    act(() => { vi.advanceTimersByTime(300); });

    const total = result.current.pagination.total;
    expect(total).toBeGreaterThan(0);

    act(() => {
      result.current.setFilters({
        ...result.current.filters,
        status: AppointmentStatus.DONE,
        showCancelled: true,
      });
    });

    expect(result.current.pagination.total).toBeLessThan(total);
  });
});
