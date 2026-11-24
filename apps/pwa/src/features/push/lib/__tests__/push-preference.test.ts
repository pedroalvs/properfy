import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPushOptOut, setPushOptOut, PUSH_OPT_OUT_KEY } from '../push-preference';

/**
 * jsdom's global localStorage is unreliable in this suite, so — like the other
 * storage libs — these tests stub `localStorage` with an in-memory implementation
 * rather than relying on the environment's.
 */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    _map: map,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('push-preference', () => {
  it('defaults to not opted out (wants push) when the key is absent', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(getPushOptOut()).toBe(false);
  });

  it('round-trips an opt-out and an opt-in', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);

    setPushOptOut(true);
    expect(storage._map.get(PUSH_OPT_OUT_KEY)).toBe('true');
    expect(getPushOptOut()).toBe(true);

    setPushOptOut(false);
    expect(storage._map.has(PUSH_OPT_OUT_KEY)).toBe(false);
    expect(getPushOptOut()).toBe(false);
  });

  it('treats any non-"true" value as not opted out', () => {
    vi.stubGlobal('localStorage', memoryStorage({ [PUSH_OPT_OUT_KEY]: 'false' }));
    expect(getPushOptOut()).toBe(false);
    vi.stubGlobal('localStorage', memoryStorage({ [PUSH_OPT_OUT_KEY]: '1' }));
    expect(getPushOptOut()).toBe(false);
  });

  it('returns false and never throws when storage read fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(getPushOptOut()).toBe(false);
  });

  it('never throws when storage write fails', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => setPushOptOut(true)).not.toThrow();
    expect(() => setPushOptOut(false)).not.toThrow();
  });
});
