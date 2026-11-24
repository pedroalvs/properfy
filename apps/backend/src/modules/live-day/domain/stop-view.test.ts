import { describe, it, expect } from 'vitest';
import { baselineInstant } from './stop-view';
import { makeStopRow } from './live-day-test-factories';

// Sydney is UTC+11 (AEDT) in November 2026, so a wall time on 2026-11-05 maps to:
//   08:00 -> 2026-11-04T21:00:00Z   13:00 -> 2026-11-05T02:00:00Z   17:00 -> 2026-11-05T06:00:00Z
describe('baselineInstant (D-12: current booking window)', () => {
  it('is the current booking window start from the live appointment columns', () => {
    const stop = makeStopRow({ scheduledDate: '2026-11-05', timeSlotStart: '13:00', tenantTimezone: 'Australia/Sydney' });
    expect(baselineInstant(stop).toISOString()).toBe('2026-11-05T02:00:00.000Z');
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
