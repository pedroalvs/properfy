import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  geocodeWithTimeout,
  GEOCODE_SYNC_TIMEOUT_MS,
  GeocodeTimeoutError,
} from './geocode-with-timeout';
import {
  MapboxPermanentGeocodingUnavailableError,
  type IGeocodingService,
  type GeocodeOptions,
  type GeocodingResult,
} from '../../domain/geocoding.service';

const RESULT: GeocodingResult = { lat: -33.8, lng: 151.2 };

/** A service that resolves/rejects after `delayMs` on the (fake) clock. */
function delayedService(
  outcome: { resolve: GeocodingResult | null } | { reject: unknown },
  delayMs: number,
): { service: IGeocodingService; calls: Array<{ address: string; options?: GeocodeOptions }> } {
  const calls: Array<{ address: string; options?: GeocodeOptions }> = [];
  const service: IGeocodingService = {
    geocode: (address, options) =>
      new Promise((resolve, reject) => {
        calls.push({ address, options });
        setTimeout(() => {
          if ('reject' in outcome) reject(outcome.reject);
          else resolve(outcome.resolve);
        }, delayMs);
      }),
  };
  return { service, calls };
}

describe('geocodeWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. resolves within the deadline and calls the service in permanent mode', async () => {
    const { service, calls } = delayedService({ resolve: RESULT }, 10);
    const promise = geocodeWithTimeout(service, 'A');
    await vi.advanceTimersByTimeAsync(10);
    await expect(promise).resolves.toEqual(RESULT);
    expect(calls).toEqual([{ address: 'A', options: { mode: 'permanent' } }]);
  });

  it('2. without opts uses GEOCODE_SYNC_TIMEOUT_MS and permanent mode', async () => {
    expect(GEOCODE_SYNC_TIMEOUT_MS).toBe(4000);
    const { service, calls } = delayedService({ resolve: RESULT }, 3999);
    const promise = geocodeWithTimeout(service, 'A');
    await vi.advanceTimersByTimeAsync(3999);
    await expect(promise).resolves.toEqual(RESULT);
    expect(calls[0]?.options).toEqual({ mode: 'permanent' });
  });

  it('3. passes a temporary mode through to the service', async () => {
    const { service, calls } = delayedService({ resolve: RESULT }, 10);
    const promise = geocodeWithTimeout(service, 'A', { mode: 'temporary' });
    await vi.advanceTimersByTimeAsync(10);
    await promise;
    expect(calls[0]?.options).toEqual({ mode: 'temporary' });
  });

  it('4. rejects with GeocodeTimeoutError at the default deadline', async () => {
    const { service } = delayedService({ resolve: RESULT }, 5000);
    const promise = geocodeWithTimeout(service, 'A');
    const assertion = expect(promise).rejects.toMatchObject({ code: 'GEOCODE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(4000);
    await assertion;
    await expect(promise).rejects.toBeInstanceOf(GeocodeTimeoutError);
  });

  it('5. rejects at a custom timeoutMs', async () => {
    const { service } = delayedService({ resolve: RESULT }, 1000);
    const promise = geocodeWithTimeout(service, 'A', { timeoutMs: 50 });
    const assertion = expect(promise).rejects.toBeInstanceOf(GeocodeTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it('6. passes the account error through unchanged', async () => {
    const err = new MapboxPermanentGeocodingUnavailableError();
    const { service } = delayedService({ reject: err }, 10);
    const promise = geocodeWithTimeout(service, 'A');
    const assertion = expect(promise).rejects.toBe(err);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });

  it('7. swallows a late service rejection without an unhandledRejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { service } = delayedService({ reject: new Error('late') }, 5000);
      const promise = geocodeWithTimeout(service, 'A', { timeoutMs: 100 });
      const assertion = expect(promise).rejects.toBeInstanceOf(GeocodeTimeoutError);
      await vi.advanceTimersByTimeAsync(100); // timeout fires
      await assertion;
      await vi.advanceTimersByTimeAsync(5000); // the lost call now rejects — must be swallowed
      await Promise.resolve();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('8. resolves null when the service returns null', async () => {
    const { service } = delayedService({ resolve: null }, 10);
    const promise = geocodeWithTimeout(service, 'A');
    await vi.advanceTimersByTimeAsync(10);
    await expect(promise).resolves.toBeNull();
  });

  it('9. leaves no pending timer after settling', async () => {
    const { service } = delayedService({ resolve: RESULT }, 10);
    const promise = geocodeWithTimeout(service, 'A');
    await vi.advanceTimersByTimeAsync(10);
    await promise;
    expect(vi.getTimerCount()).toBe(0);
  });
});
