import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUserDetail } from './useUserDetail';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useUserDetail', () => {
  it('returns user by id', () => {
    const { result } = renderHook(() => useUserDetail('usr-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.user).not.toBeNull();
    expect(result.current.user?.name).toBe('Admin Principal');
  });

  it('returns null for unknown id', () => {
    const { result } = renderHook(() => useUserDetail('unknown'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.user).toBeNull();
  });

  it('returns null when id is null', () => {
    const { result } = renderHook(() => useUserDetail(null));
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const { result } = renderHook(() => useUserDetail('usr-01'));
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);
  });

  it('refetch triggers reload', () => {
    const { result } = renderHook(() => useUserDetail('usr-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);

    act(() => { result.current.refetch(); });
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.user?.name).toBe('Admin Principal');
  });
});
