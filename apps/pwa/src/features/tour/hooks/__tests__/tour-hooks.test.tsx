import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrefersReducedMotion } from '../usePrefersReducedMotion';
import { useTargetRect } from '../useTargetRect';

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches,
    media: '',
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    addListener: (cb: () => void) => listeners.add(cb),
    removeListener: (cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => true,
    onchange: null,
  } as unknown as MediaQueryList;
  vi.spyOn(window, 'matchMedia').mockReturnValue(mql);
  return mql;
}

function setRect(el: HTMLElement, rect: { x: number; y: number; w: number; h: number }) {
  el.getBoundingClientRect = () =>
    ({
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      right: rect.x + rect.w,
      bottom: rect.y + rect.h,
      x: rect.x,
      y: rect.y,
      toJSON: () => ({}),
    }) as DOMRect;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('usePrefersReducedMotion', () => {
  it('reflects the media query state', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('is false when the preference is not set', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});

describe('useTargetRect', () => {
  it('resolves immediately with no rect for a centered (null-anchor) step', () => {
    const { result } = renderHook(() => useTargetRect(null, true));
    expect(result.current).toEqual({ rect: null, isVisible: false, resolved: true });
  });

  it('measures a present target and reports it visible', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-tour', 'nav-today');
    setRect(el, { x: 20, y: 600, w: 100, h: 44 });
    document.body.appendChild(el);

    const { result } = renderHook(() => useTargetRect('nav-today', true));
    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.isVisible).toBe(true);
    expect(result.current.rect).toEqual({ x: 20, y: 600, w: 100, h: 44 });
  });

  it('settles as not-visible when the target never appears', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useTargetRect('today-next', true));
      expect(result.current.resolved).toBe(false);
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(result.current.resolved).toBe(true);
      expect(result.current.isVisible).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
