import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useServiceGroupDetail } from './useServiceGroupDetail';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useServiceGroupDetail', () => {
  it('returns service group by id', () => {
    const { result } = renderHook(() => useServiceGroupDetail('sg-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.serviceGroup).not.toBeNull();
    expect(result.current.serviceGroup?.name).toBe('Zona Sul SP');
  });

  it('returns null for unknown id', () => {
    const { result } = renderHook(() => useServiceGroupDetail('unknown'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.serviceGroup).toBeNull();
  });

  it('returns null when id is null', () => {
    const { result } = renderHook(() => useServiceGroupDetail(null));
    expect(result.current.serviceGroup).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const { result } = renderHook(() => useServiceGroupDetail('sg-01'));
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);
  });

  it('refetch triggers reload', () => {
    const { result } = renderHook(() => useServiceGroupDetail('sg-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);

    act(() => { result.current.refetch(); });
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.serviceGroup?.name).toBe('Zona Sul SP');
  });
});
