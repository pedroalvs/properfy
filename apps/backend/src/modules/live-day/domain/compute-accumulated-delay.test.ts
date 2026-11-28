import { describe, it, expect } from 'vitest';
import { computeAccumulatedDelay } from './compute-accumulated-delay';
import { makeStopRow } from './live-day-test-factories';
import type { LiveDayStopRow } from './live-day.read-repository';

// Pure-domain tests: the baseline is the stop's CURRENT booking window start
// (`scheduled_date` + `time_slot_start` in the agency tz, D-12). The fixtures pin the
// agency timezone to UTC so a `HH:mm` wall time reads as that instant directly.
const row = (fields: Partial<LiveDayStopRow>): LiveDayStopRow =>
  makeStopRow({
    appointmentId: fields.appointmentId ?? 'A',
    tenantTimezone: 'UTC',
    scheduledDate: '2026-11-05',
    ...fields,
  });

describe('computeAccumulatedDelay (§5, test 4)', () => {
  it('latest started 10:17 vs window 10:00 -> 17', () => {
    expect(
      computeAccumulatedDelay([row({ timeSlotStart: '10:00', startedAt: '2026-11-05T10:17:00Z' })]),
    ).toBe(17);
  });

  it('early (09:50 vs 10:00) -> -10', () => {
    expect(
      computeAccumulatedDelay([row({ timeSlotStart: '10:00', startedAt: '2026-11-05T09:50:00Z' })]),
    ).toBe(-10);
  });

  it('measures against the current window, not the frozen published/stored stop windows', () => {
    // Published for 17:00, rescheduled to a narrow 13:00-13:15 window (stored windows
    // stay frozen at 17:00). The frozen ETA (17:00) now falls OUTSIDE the current
    // window, so the guard rejects it. Check-in 13:17 is 17 minutes late against the
    // current window start, not ~4h early.
    expect(
      computeAccumulatedDelay([
        row({
          timeSlotStart: '13:00',
          timeSlotEnd: '13:15',
          startedAt: '2026-11-05T13:17:00Z',
          publishedServiceStartAt: '2026-11-05T17:00:00Z',
          serviceStartAt: '2026-11-05T17:00:00Z',
          windowStartAt: '2026-11-05T17:00:00Z',
        }),
      ]),
    ).toBe(17);
  });

  it('no stop started -> null', () => {
    expect(computeAccumulatedDelay([row({ startedAt: null })])).toBeNull();
    expect(computeAccumulatedDelay([])).toBeNull();
  });

  it('two started -> uses the one with the greatest startedAt', () => {
    const result = computeAccumulatedDelay([
      row({ appointmentId: 'A', timeSlotStart: '10:00', startedAt: '2026-11-05T10:00:00Z' }),
      row({ appointmentId: 'B', timeSlotStart: '10:00', startedAt: '2026-11-05T10:17:00Z' }),
    ]);
    expect(result).toBe(17);
  });

  it('seconds truncate toward the floor: 10:17:59 vs 10:00 -> 17', () => {
    expect(
      computeAccumulatedDelay([row({ timeSlotStart: '10:00', startedAt: '2026-11-05T10:17:59Z' })]),
    ).toBe(17);
  });

  it('an abandoned started stop does not count', () => {
    expect(
      computeAccumulatedDelay([
        row({ timeSlotStart: '10:00', startedAt: '2026-11-05T10:17:00Z', abandonedAt: '2026-11-05T10:20:00Z' }),
      ]),
    ).toBeNull();
  });
});
