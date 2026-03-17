import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardStats } from './useDashboardStats';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDashboardStats', () => {
  it('returns null stats while loading', () => {
    const { result } = renderHook(() => useDashboardStats());

    expect(result.current.stats).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns stats after loading resolves', () => {
    const { result } = renderHook(() => useDashboardStats());

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.stats).not.toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('has correct appointment status counts', () => {
    const { result } = renderHook(() => useDashboardStats());

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const { appointmentsByStatus } = result.current.stats!;
    expect(appointmentsByStatus.draft).toBe(2);
    expect(appointmentsByStatus.awaitingInspector).toBe(3);
    expect(appointmentsByStatus.scheduled).toBe(4);
    expect(appointmentsByStatus.doneThisMonth).toBe(3);
  });

  it('has 5 recent appointments', () => {
    const { result } = renderHook(() => useDashboardStats());

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.stats!.recentAppointments).toHaveLength(5);
  });

  it('has recent appointments sorted by most recent first', () => {
    const { result } = renderHook(() => useDashboardStats());

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const ids = result.current.stats!.recentAppointments.map((a) => a.id);
    expect(ids[0]).toBe('apt-15');
    expect(ids[ids.length - 1]).toBe('apt-07');
  });

  it('has correct pending actions counts', () => {
    const { result } = renderHook(() => useDashboardStats());

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const { pendingActions } = result.current.stats!;
    expect(pendingActions.noResponseTenants).toBe(2);
    expect(pendingActions.pendingFinancialEntries).toBe(5);
    expect(pendingActions.processingReports).toBe(2);
  });

  it('has correct quick stats counts', () => {
    const { result } = renderHook(() => useDashboardStats());

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const { quickStats } = result.current.stats!;
    expect(quickStats.totalProperties).toBe(15);
    expect(quickStats.activeInspectors).toBe(12);
    expect(quickStats.activeServiceGroups).toBe(9);
  });

  it('isError is always false', () => {
    const { result } = renderHook(() => useDashboardStats());

    expect(result.current.isError).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isError).toBe(false);
  });
});
