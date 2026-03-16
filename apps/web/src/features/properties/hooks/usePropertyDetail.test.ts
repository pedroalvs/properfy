import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePropertyDetail } from './usePropertyDetail';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePropertyDetail', () => {
  it('returns property by id', () => {
    const { result } = renderHook(() => usePropertyDetail('prop-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.property).not.toBeNull();
    expect(result.current.property?.propertyCode).toBe('IMV-001');
  });

  it('returns null for unknown id', () => {
    const { result } = renderHook(() => usePropertyDetail('unknown'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.property).toBeNull();
  });

  it('returns null when id is null', () => {
    const { result } = renderHook(() => usePropertyDetail(null));
    expect(result.current.property).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const { result } = renderHook(() => usePropertyDetail('prop-01'));
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);
  });

  it('refetch triggers reload', () => {
    const { result } = renderHook(() => usePropertyDetail('prop-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);

    act(() => { result.current.refetch(); });
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.property?.propertyCode).toBe('IMV-001');
  });
});
