import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// Mock useSearchParams so each test controls the ?mode= seed deterministically.
let mockSearch = new URLSearchParams();
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearch, vi.fn()] as const,
}));

import { useMapFilterPersistence } from './useMapFilterPersistence';

const KEY = 'appointments-map.filters.open';

describe('useMapFilterPersistence', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    mockSearch = new URLSearchParams();
    store = {};
    // jsdom's sessionStorage instance does not delegate to Storage.prototype,
    // so replace the global with a plain mock we fully control.
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = String(v);
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        store = {};
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('seeds mode=groups from ?mode=groups for a global role', () => {
    mockSearch = new URLSearchParams('mode=groups');
    const { result } = renderHook(() => useMapFilterPersistence({ isGlobalRole: true }));
    expect(result.current.mode).toBe('groups');
  });

  it('ignores ?mode=groups for a non-global role', () => {
    mockSearch = new URLSearchParams('mode=groups');
    const { result } = renderHook(() => useMapFilterPersistence({ isGlobalRole: false }));
    expect(result.current.mode).toBe('appointments');
  });

  it('defaults mode to appointments with no param', () => {
    const { result } = renderHook(() => useMapFilterPersistence({ isGlobalRole: true }));
    expect(result.current.mode).toBe('appointments');
  });

  it('setMode updates mode (and does not touch the URL — seed-once)', () => {
    const { result } = renderHook(() => useMapFilterPersistence({ isGlobalRole: true }));
    act(() => result.current.setMode('groups'));
    expect(result.current.mode).toBe('groups');
  });

  it('filtersOpen defaults false with empty storage, true when stored "true"', () => {
    const { result: closed } = renderHook(() => useMapFilterPersistence({ isGlobalRole: true }));
    expect(closed.current.filtersOpen).toBe(false);

    store[KEY] = 'true';
    const { result: open } = renderHook(() => useMapFilterPersistence({ isGlobalRole: true }));
    expect(open.current.filtersOpen).toBe(true);
  });

  it('toggleFilters flips the flag and persists it', () => {
    const { result } = renderHook(() => useMapFilterPersistence({ isGlobalRole: true }));
    act(() => result.current.toggleFilters());
    expect(result.current.filtersOpen).toBe(true);
    expect(store[KEY]).toBe('true');
    act(() => result.current.toggleFilters());
    expect(result.current.filtersOpen).toBe(false);
    expect(store[KEY]).toBe('false');
  });

  it('survives throwing storage without crashing', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const { result } = renderHook(() => useMapFilterPersistence({ isGlobalRole: true }));
    expect(result.current.filtersOpen).toBe(false);
    expect(() => act(() => result.current.toggleFilters())).not.toThrow();
    expect(result.current.filtersOpen).toBe(true); // state still flips even if persistence fails
  });

  it('keeps toggleFilters identity stable across renders', () => {
    const { result, rerender } = renderHook(() => useMapFilterPersistence({ isGlobalRole: true }));
    const first = result.current.toggleFilters;
    act(() => result.current.toggleFilters());
    rerender();
    expect(result.current.toggleFilters).toBe(first);
  });
});
