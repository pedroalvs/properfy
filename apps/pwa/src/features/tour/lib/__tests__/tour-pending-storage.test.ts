import { describe, expect, it, vi } from 'vitest';
import {
  TOUR_PENDING_KEY,
  clearTourPending,
  isTourPendingFor,
  setTourPending,
} from '../tour-pending-storage';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

const USER = 'user-1';
const OTHER = 'user-2';

describe('tour-pending-storage', () => {
  it('persists a pending completion for a user and reads it back', () => {
    const storage = memoryStorage();
    setTourPending(storage, USER);
    expect(storage._map.get(TOUR_PENDING_KEY)).toBe(USER);
    expect(isTourPendingFor(storage, USER)).toBe(true);
  });

  it('ignores a pending record that belongs to another user', () => {
    const storage = memoryStorage({ [TOUR_PENDING_KEY]: OTHER });
    expect(isTourPendingFor(storage, USER)).toBe(false);
  });

  it('reports no pending when the key is absent', () => {
    expect(isTourPendingFor(memoryStorage(), USER)).toBe(false);
  });

  it('clears the pending record', () => {
    const storage = memoryStorage({ [TOUR_PENDING_KEY]: USER });
    clearTourPending(storage);
    expect(storage._map.has(TOUR_PENDING_KEY)).toBe(false);
  });

  it('degrades safely when getItem throws', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(() => isTourPendingFor(storage, USER)).not.toThrow();
    expect(isTourPendingFor(storage, USER)).toBe(false);
  });

  it('degrades safely when setItem/removeItem throw', () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      removeItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };
    expect(() => setTourPending(storage, USER)).not.toThrow();
    expect(() => clearTourPending(storage)).not.toThrow();
  });

  it('is a no-op with no storage', () => {
    expect(isTourPendingFor(undefined, USER)).toBe(false);
    expect(() => setTourPending(undefined, USER)).not.toThrow();
    expect(() => clearTourPending(undefined)).not.toThrow();
  });
});
