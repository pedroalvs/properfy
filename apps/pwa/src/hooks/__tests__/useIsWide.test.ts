import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsWide } from '../useIsWide';

type Listener = () => void;

function installMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initial,
    media: '',
    onchange: null,
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
    addListener: (cb: Listener) => listeners.add(cb),
    removeListener: (cb: Listener) => listeners.delete(cb),
    dispatchEvent: () => false,
  };
  // @ts-expect-error jsdom has no matchMedia; we define it for the test.
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return {
    set(next: boolean) {
      mql.matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

afterEach(() => {
  // @ts-expect-error restore the jsdom default (absent).
  delete window.matchMedia;
});

describe('useIsWide', () => {
  it('reports false when matchMedia is unavailable (phone default)', () => {
    // @ts-expect-error ensure it is absent for this case.
    delete window.matchMedia;
    const { result } = renderHook(() => useIsWide());
    expect(result.current).toBe(false);
  });

  it('reports true when the viewport matches the wide query', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useIsWide());
    expect(result.current).toBe(true);
  });

  it('reacts to a change from narrow to wide', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useIsWide());
    expect(result.current).toBe(false);

    act(() => media.set(true));
    expect(result.current).toBe(true);
  });
});
