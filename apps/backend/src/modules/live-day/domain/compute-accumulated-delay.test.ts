import { describe, it, expect } from 'vitest';
import { computeAccumulatedDelay } from './compute-accumulated-delay';
import { makeStopRow } from './live-day-test-factories';
import type { LiveDayStopRow } from './live-day.read-repository';

const row = (fields: Partial<LiveDayStopRow>): LiveDayStopRow =>
  makeStopRow({ appointmentId: fields.appointmentId ?? 'A', ...fields });

describe('computeAccumulatedDelay (§5, test 4)', () => {
  it('latest started 10:17 vs published 10:00 -> 17', () => {
    expect(
      computeAccumulatedDelay([
        row({ startedAt: '2026-11-05T10:17:00Z', publishedServiceStartAt: '2026-11-05T10:00:00Z', serviceStartAt: null }),
      ]),
    ).toBe(17);
  });

  it('no published, service_start 10:05 -> 12', () => {
    expect(
      computeAccumulatedDelay([
        row({ startedAt: '2026-11-05T10:17:00Z', publishedServiceStartAt: null, serviceStartAt: '2026-11-05T10:05:00Z' }),
      ]),
    ).toBe(12);
  });

  it('no published/service, window 10:00 -> 17', () => {
    expect(
      computeAccumulatedDelay([
        row({ startedAt: '2026-11-05T10:17:00Z', publishedServiceStartAt: null, serviceStartAt: null, windowStartAt: '2026-11-05T10:00:00Z' }),
      ]),
    ).toBe(17);
  });

  it('early (09:50 vs 10:00) -> -10', () => {
    expect(
      computeAccumulatedDelay([
        row({ startedAt: '2026-11-05T09:50:00Z', publishedServiceStartAt: '2026-11-05T10:00:00Z', serviceStartAt: null }),
      ]),
    ).toBe(-10);
  });

  it('no stop started -> null', () => {
    expect(computeAccumulatedDelay([row({ startedAt: null })])).toBeNull();
    expect(computeAccumulatedDelay([])).toBeNull();
  });

  it('two started -> uses the one with the greatest startedAt', () => {
    const result = computeAccumulatedDelay([
      row({ appointmentId: 'A', startedAt: '2026-11-05T10:00:00Z', publishedServiceStartAt: '2026-11-05T10:00:00Z', serviceStartAt: null }),
      row({ appointmentId: 'B', startedAt: '2026-11-05T10:17:00Z', publishedServiceStartAt: '2026-11-05T10:00:00Z', serviceStartAt: null }),
    ]);
    expect(result).toBe(17);
  });

  it('seconds truncate toward the floor: 10:17:59 vs 10:00 -> 17', () => {
    expect(
      computeAccumulatedDelay([
        row({ startedAt: '2026-11-05T10:17:59Z', publishedServiceStartAt: '2026-11-05T10:00:00Z', serviceStartAt: null }),
      ]),
    ).toBe(17);
  });

  it('an abandoned started stop does not count', () => {
    expect(
      computeAccumulatedDelay([
        row({ startedAt: '2026-11-05T10:17:00Z', abandonedAt: '2026-11-05T10:20:00Z', publishedServiceStartAt: '2026-11-05T10:00:00Z' }),
      ]),
    ).toBeNull();
  });
});
