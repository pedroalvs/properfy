import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizableWidth } from './useResizableWidth';

describe('useResizableWidth', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns initialPx clamped to [minPx, maxPx]', () => {
    const { result } = renderHook(() =>
      useResizableWidth({ initialPx: 600, minPx: 400, maxPx: 800 }),
    );
    expect(result.current.widthPx).toBe(600);
  });

  it('clamps values below minPx to minPx', () => {
    const { result } = renderHook(() =>
      useResizableWidth({ initialPx: 100, minPx: 400, maxPx: 800 }),
    );
    expect(result.current.widthPx).toBe(400);
  });

  it('clamps values above maxPx to maxPx', () => {
    const { result } = renderHook(() =>
      useResizableWidth({ initialPx: 1200, minPx: 400, maxPx: 800 }),
    );
    expect(result.current.widthPx).toBe(800);
  });

  it('reads and clamps stored value from sessionStorage', () => {
    sessionStorage.setItem('test-key', '1500');
    const { result } = renderHook(() =>
      useResizableWidth({ initialPx: 480, minPx: 360, maxPx: 900, storageKey: 'test-key' }),
    );
    expect(result.current.widthPx).toBe(900);
  });

  it('falls back to initialPx when storage has non-numeric value', () => {
    sessionStorage.setItem('test-key', 'invalid');
    const { result } = renderHook(() =>
      useResizableWidth({ initialPx: 480, minPx: 360, maxPx: 900, storageKey: 'test-key' }),
    );
    expect(result.current.widthPx).toBe(480);
  });

  it('starts not dragging', () => {
    const { result } = renderHook(() => useResizableWidth({ initialPx: 480 }));
    expect(result.current.isDragging).toBe(false);
  });

  it('sets isDragging to true on handleMouseDown', () => {
    const { result } = renderHook(() => useResizableWidth({ initialPx: 480 }));
    act(() => {
      result.current.onHandleMouseDown({ clientX: 500, preventDefault: vi.fn() } as any);
    });
    expect(result.current.isDragging).toBe(true);
  });
});
