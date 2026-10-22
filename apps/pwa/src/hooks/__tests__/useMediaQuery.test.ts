import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TABLET_MIN_WIDTH, useIsWide, useMediaQuery } from '../useMediaQuery';

/**
 * Build a controllable matchMedia stub. `matchesFor` decides the initial match per
 * query; `fire` replays the registered change listeners after flipping the value.
 */
function installMatchMedia(matchesFor: (query: string) => boolean) {
  const listeners = new Set<() => void>();
  let currentMatches = false;

  const matchMedia = vi.fn().mockImplementation((query: string) => {
    currentMatches = matchesFor(query);
    return {
      get matches() {
        return currentMatches;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
      addListener: (cb: () => void) => listeners.add(cb),
      removeListener: (cb: () => void) => listeners.delete(cb),
      dispatchEvent: vi.fn(),
    };
  });

  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;

  return {
    setMatches(next: boolean) {
      currentMatches = next;
      act(() => listeners.forEach((cb) => cb()));
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMediaQuery', () => {
  it('returns the initial match for the query', () => {
    installMatchMedia((q) => q.includes('768'));
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('returns false when the query does not match', () => {
    installMatchMedia(() => false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('updates when the viewport crosses the breakpoint', () => {
    const control = installMatchMedia(() => false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
    control.setMatches(true);
    expect(result.current).toBe(true);
  });
});

describe('useIsWide', () => {
  it('queries the tablet breakpoint', () => {
    const matchMedia = installMatchMedia((q) => q === `(min-width: ${TABLET_MIN_WIDTH}px)`);
    const { result } = renderHook(() => useIsWide());
    expect(result.current).toBe(true);
    // The hook asked for exactly the md breakpoint.
    expect(window.matchMedia).toHaveBeenCalledWith(`(min-width: ${TABLET_MIN_WIDTH}px)`);
    expect(matchMedia).toBeDefined();
  });
});
