import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppointmentDetail } from './useAppointmentDetail';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAppointmentDetail', () => {
  it('returns appointment by id', () => {
    const { result } = renderHook(() => useAppointmentDetail('apt-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.appointment).not.toBeNull();
    expect(result.current.appointment?.code).toBe('VST-001');
  });

  it('returns null for unknown id', () => {
    const { result } = renderHook(() => useAppointmentDetail('unknown'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.appointment).toBeNull();
  });

  it('returns null when id is null', () => {
    const { result } = renderHook(() => useAppointmentDetail(null));
    expect(result.current.appointment).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const { result } = renderHook(() => useAppointmentDetail('apt-01'));
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);
  });

  it('refetch triggers reload', () => {
    const { result } = renderHook(() => useAppointmentDetail('apt-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);

    act(() => { result.current.refetch(); });
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.appointment?.code).toBe('VST-001');
  });
});
