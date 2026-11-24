import { describe, it, expect } from 'vitest';
import { baselineInstant } from './stop-view';
import { makeStopRow } from './live-day-test-factories';

// Sydney is UTC+11 (AEDT) in November 2026, so a wall time on 2026-11-05 maps to:
//   08:00 -> 2026-11-04T21:00:00Z   13:00 -> 2026-11-05T02:00:00Z
//   16:00 -> 2026-11-05T05:00:00Z   17:00 -> 2026-11-05T06:00:00Z
describe('baselineInstant (D-12: routed ETA within the current booking window)', () => {
  it('falls back to the current booking window start when no routed ETA is inside the window', () => {
    // serviceStartAt (factory default 2026-11-04T21:00Z = 08:00) is before the 13:00 window → guard rejects it.
    const stop = makeStopRow({ scheduledDate: '2026-11-05', timeSlotStart: '13:00', tenantTimezone: 'Australia/Sydney' });
    expect(baselineInstant(stop).toISOString()).toBe('2026-11-05T02:00:00.000Z');
  });

  it('uses the routed ETA (service_start_at) when it falls inside a wide window with no reschedule', () => {
    // A 13:00-17:00 window (4h, far wider than the ~45-min service) with the routed arrival
    // at 16:00. The ETA is inside the live window, so the baseline is the routed arrival —
    // NOT the window start. (Fails against the previous rule, which always used the window start.)
    const stop = makeStopRow({
      scheduledDate: '2026-11-05',
      timeSlotStart: '13:00',
      timeSlotEnd: '17:00',
      tenantTimezone: 'Australia/Sydney',
      serviceStartAt: '2026-11-05T05:00:00.000Z', // 16:00, inside [13:00, 17:00]
    });
    expect(baselineInstant(stop).toISOString()).toBe('2026-11-05T05:00:00.000Z');
  });

  it('falls back to the window start when service_start_at is null', () => {
    const stop = makeStopRow({
      scheduledDate: '2026-11-05',
      timeSlotStart: '13:00',
      timeSlotEnd: '17:00',
      tenantTimezone: 'Australia/Sydney',
      serviceStartAt: null,
    });
    expect(baselineInstant(stop).toISOString()).toBe('2026-11-05T02:00:00.000Z');
  });

  it('falls back to the window start when the routed ETA is after the window end (overflow / infeasible plan)', () => {
    const stop = makeStopRow({
      scheduledDate: '2026-11-05',
      timeSlotStart: '13:00',
      timeSlotEnd: '17:00',
      tenantTimezone: 'Australia/Sydney',
      serviceStartAt: '2026-11-05T07:00:00.000Z', // 18:00, past the 17:00 window end
    });
    expect(baselineInstant(stop).toISOString()).toBe('2026-11-05T02:00:00.000Z');
  });

  it('honours the agency timezone for both the window and the in-window check (cross-tz)', () => {
    // Perth is UTC+8 (no DST): 10:00 -> 02:00Z, 15:00 -> 07:00Z, routed 12:00 -> 04:00Z (inside).
    const stop = makeStopRow({
      scheduledDate: '2026-11-05',
      timeSlotStart: '10:00',
      timeSlotEnd: '15:00',
      tenantTimezone: 'Australia/Perth',
      serviceStartAt: '2026-11-05T04:00:00.000Z', // 12:00 Perth, inside [10:00, 15:00]
    });
    expect(baselineInstant(stop).toISOString()).toBe('2026-11-05T04:00:00.000Z');
  });

  it('follows a reschedule and ignores the frozen published / stored stop windows', () => {
    // Published for 17:00, then rescheduled to 13:00. The stored stop windows
    // (published/service/window) stay frozen at 17:00 (a reschedule only marks the
    // plan STALE), but the live appointment columns now read 13:00.
    const rescheduled = makeStopRow({
      scheduledDate: '2026-11-05',
      timeSlotStart: '13:00',
      timeSlotEnd: '13:15',
      tenantTimezone: 'Australia/Sydney',
      publishedServiceStartAt: '2026-11-05T06:00:00.000Z', // frozen 17:00
      serviceStartAt: '2026-11-05T06:00:00.000Z',
      windowStartAt: '2026-11-05T06:00:00.000Z',
    });
    expect(baselineInstant(rescheduled).toISOString()).toBe('2026-11-05T02:00:00.000Z');
    // The frozen published value (the Route ETA-accuracy source, L-F04-15) is never
    // what the baseline returns once the two diverge.
    expect(baselineInstant(rescheduled).toISOString()).not.toBe(rescheduled.publishedServiceStartAt);
  });

  it('is unaffected by the frozen published value even when no reschedule happened', () => {
    const stop = makeStopRow({
      scheduledDate: '2026-11-05',
      timeSlotStart: '13:00',
      tenantTimezone: 'Australia/Sydney',
      publishedServiceStartAt: '2026-11-05T05:30:00.000Z',
    });
    expect(baselineInstant(stop).toISOString()).toBe('2026-11-05T02:00:00.000Z');
  });
});
