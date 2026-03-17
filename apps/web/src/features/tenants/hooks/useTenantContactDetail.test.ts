import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTenantContactDetail } from './useTenantContactDetail';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTenantContactDetail', () => {
  it('returns contact by id', () => {
    const { result } = renderHook(() => useTenantContactDetail('tnt-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.contact?.name).toBe('Ana Silva');
  });

  it('returns null for unknown id', () => {
    const { result } = renderHook(() => useTenantContactDetail('unknown'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.contact).toBeNull();
  });

  it('returns null when id is null', () => {
    const { result } = renderHook(() => useTenantContactDetail(null));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.contact).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const { result } = renderHook(() => useTenantContactDetail('tnt-01'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.contact).toBeNull();
  });

  it('refetch triggers reload', () => {
    const { result } = renderHook(() => useTenantContactDetail('tnt-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.contact?.name).toBe('Ana Silva');
    act(() => { result.current.refetch(); });
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.contact?.name).toBe('Ana Silva');
  });
});
