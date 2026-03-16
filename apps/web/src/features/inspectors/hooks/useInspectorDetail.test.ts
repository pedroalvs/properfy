import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInspectorDetail } from './useInspectorDetail';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useInspectorDetail', () => {
  it('returns inspector by id', () => {
    const { result } = renderHook(() => useInspectorDetail('insp-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.inspector).not.toBeNull();
    expect(result.current.inspector?.name).toBe('Carlos Silva');
  });

  it('returns null for unknown id', () => {
    const { result } = renderHook(() => useInspectorDetail('unknown'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.inspector).toBeNull();
  });

  it('returns null when id is null', () => {
    const { result } = renderHook(() => useInspectorDetail(null));
    expect(result.current.inspector).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const { result } = renderHook(() => useInspectorDetail('insp-01'));
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);
  });

  it('refetch triggers reload', () => {
    const { result } = renderHook(() => useInspectorDetail('insp-01'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);

    act(() => { result.current.refetch(); });
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.inspector?.name).toBe('Carlos Silva');
  });
});
