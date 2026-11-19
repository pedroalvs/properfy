import { describe, it, expect } from 'vitest';
import type { LiveDayInspectorState } from '@properfy/shared';
import { computeEstimatedArrivalAt } from '../../inspector-execution/domain/late-notice';
import { deriveAlerts, type DeriveAlertsInput } from './derive-alerts';
import { makeStopRow, makeEventRow, makeReminderRow } from './live-day-test-factories';
import type { LiveDayStopRow } from './live-day.read-repository';

const THRESHOLDS = {
  delayMinutes: 20,
  delaySource: 'PLATFORM' as const,
  notStartedMinutes: 30,
  notStartedSource: 'PLATFORM' as const,
};

function run(over: Partial<DeriveAlertsInput>) {
  const input: DeriveAlertsInput = {
    visible: [],
    events: [],
    reminders: [],
    now: new Date('2026-11-05T02:00:00Z'),
    isPastDay: false,
    state: 'IN_TRANSIT',
    delayMinutes: null,
    thresholds: THRESHOLDS,
    checkInWindowTolerance: 15,
    ...over,
  };
  return deriveAlerts(input);
}

const typesOf = (over: Partial<DeriveAlertsInput>) => run(over).map((a) => a.type);

describe('deriveAlerts — DELAY', () => {
  const started: LiveDayStopRow = makeStopRow({
    appointmentId: 'A',
    publishedServiceStartAt: '2026-11-05T01:00:00Z',
    startedAt: '2026-11-05T01:30:00Z',
  });
  it('fires above the threshold when in transit / at property', () => {
    const [a] = run({ visible: [started], delayMinutes: 25, state: 'IN_TRANSIT' });
    expect(a).toMatchObject({ type: 'DELAY', minutes: 25, thresholdMinutes: 20, thresholdSource: 'PLATFORM', appointmentId: 'A' });
  });
  it('does not fire at or below the threshold', () => {
    expect(typesOf({ visible: [started], delayMinutes: 20, state: 'IN_TRANSIT' })).not.toContain('DELAY');
  });
  it('is suppressed when DONE_FOR_DAY on today', () => {
    expect(typesOf({ visible: [started], delayMinutes: 25, state: 'DONE_FOR_DAY' })).not.toContain('DELAY');
  });
  it('is shown even when DONE_FOR_DAY on a past day', () => {
    expect(typesOf({ visible: [started], delayMinutes: 25, state: 'DONE_FOR_DAY', isPastDay: true })).toContain('DELAY');
  });
});

describe('deriveAlerts — NOT_STARTED (per stop)', () => {
  const notStarted = (baseline: string) =>
    makeStopRow({ appointmentId: 'A', publishedServiceStartAt: baseline, windowStartAt: baseline, startedAt: null });

  it('fires strictly above the threshold', () => {
    const [a] = run({ visible: [notStarted('2026-11-05T01:29:00Z')], now: new Date('2026-11-05T02:00:00Z') });
    expect(a).toMatchObject({ type: 'NOT_STARTED', minutes: 31, appointmentId: 'A', thresholdMinutes: 30 });
  });
  it('does not fire exactly at the threshold', () => {
    expect(typesOf({ visible: [notStarted('2026-11-05T01:30:00Z')], now: new Date('2026-11-05T02:00:00Z') })).not.toContain(
      'NOT_STARTED',
    );
  });
  it('measures to window end on a past day', () => {
    const stop = makeStopRow({
      appointmentId: 'A',
      publishedServiceStartAt: '2026-11-04T23:00:00Z',
      windowStartAt: '2026-11-04T23:00:00Z',
      windowEndAt: '2026-11-05T06:00:00Z',
      startedAt: null,
    });
    const [a] = run({ visible: [stop], isPastDay: true, now: new Date('2026-11-05T02:00:00Z') });
    expect(a).toMatchObject({ type: 'NOT_STARTED', minutes: 420 });
  });
  it('an abandoned execution still counts as not started', () => {
    const stop = makeStopRow({
      appointmentId: 'A',
      publishedServiceStartAt: '2026-11-05T01:00:00Z',
      windowStartAt: '2026-11-05T01:00:00Z',
      startedAt: '2026-11-05T01:10:00Z',
      abandonedAt: '2026-11-05T01:20:00Z',
    });
    expect(typesOf({ visible: [stop] })).toContain('NOT_STARTED');
  });
});

describe('deriveAlerts — LATE_NOTICE', () => {
  const stop = makeStopRow({ appointmentId: 'A', startedAt: null, timeSlotStart: '08:00', scheduledDate: '2026-11-05' });
  it('fires on a not-started stop and computes the estimate via the real F03 helper', () => {
    const event = makeEventRow({ type: 'LATE_NOTICE', appointmentId: 'A', reasonCode: 'TRAFFIC', minutes: 20, createdAt: '2026-11-04T22:30:00Z', clientOccurredAt: null });
    const a = run({ visible: [stop], events: [event] }).find((x) => x.type === 'LATE_NOTICE');
    const expected = computeEstimatedArrivalAt(
      new Date('2026-11-04T21:00:00.000Z'), // 08:00 Sydney (AEDT +11) booked window start
      new Date('2026-11-04T22:30:00Z'),
      20,
    );
    expect(a).toMatchObject({ type: 'LATE_NOTICE', minutes: 20, appointmentId: 'A', reason: 'TRAFFIC' });
    expect(a!.estimatedArrivalAt).toBe(expected.toISOString());
  });
  it('does not fire once the stop is started', () => {
    const event = makeEventRow({ type: 'LATE_NOTICE', appointmentId: 'A', minutes: 20 });
    const startedStop = makeStopRow({ appointmentId: 'A', startedAt: '2026-11-05T01:00:00Z' });
    expect(typesOf({ visible: [startedStop], events: [event] })).not.toContain('LATE_NOTICE');
  });
  it('keeps only the latest notice per stop', () => {
    const events = [
      makeEventRow({ type: 'LATE_NOTICE', appointmentId: 'A', minutes: 10, createdAt: '2026-11-04T22:00:00Z' }),
      makeEventRow({ type: 'LATE_NOTICE', appointmentId: 'A', minutes: 30, createdAt: '2026-11-04T23:00:00Z' }),
    ];
    const got = run({ visible: [stop], events }).filter((a) => a.type === 'LATE_NOTICE');
    expect(got).toHaveLength(1);
    expect(got[0]!.minutes).toBe(30);
  });
});

describe('deriveAlerts — CANT_DO', () => {
  it('fires for an active cant-do', () => {
    const [a] = run({ events: [makeEventRow({ type: 'CANT_DO', cantDoActive: true, note: 'gate locked' })] });
    expect(a).toMatchObject({ type: 'CANT_DO', note: 'gate locked' });
  });
  it('exits once re-offered / reassigned (cantDoActive false)', () => {
    expect(typesOf({ events: [makeEventRow({ type: 'CANT_DO', cantDoActive: false })] })).not.toContain('CANT_DO');
  });
});

describe('deriveAlerts — GEOFENCE', () => {
  it('START fires while in progress and exits once finished', () => {
    const inProgress = makeStopRow({ appointmentId: 'A', startedAt: '2026-11-05T01:00:00Z', outOfRadius: true, geolocationDistanceMeters: 412.6, geofenceRadiusM: 300 });
    const [a] = run({ visible: [inProgress] });
    expect(a).toMatchObject({ type: 'GEOFENCE', phase: 'START', distanceMeters: 413, radiusMeters: 300 });

    const finished = makeStopRow({ ...inProgress, finishedAt: '2026-11-05T01:40:00Z' });
    expect(run({ visible: [finished] }).filter((x) => x.phase === 'START')).toHaveLength(0);
  });
  it('FINISH fires at check-out', () => {
    const finished = makeStopRow({ appointmentId: 'A', startedAt: '2026-11-05T01:00:00Z', finishedAt: '2026-11-05T01:40:00Z', finishOutOfRadius: true, finishGeolocationDistanceMeters: 150, geofenceRadiusM: 100 });
    const geofence = run({ visible: [finished] }).filter((x) => x.type === 'GEOFENCE');
    expect(geofence).toHaveLength(1);
    expect(geofence[0]).toMatchObject({ phase: 'FINISH', distanceMeters: 150 });
  });
  it('an abandoned execution does not produce GEOFENCE', () => {
    const abandoned = makeStopRow({ appointmentId: 'A', startedAt: '2026-11-05T01:00:00Z', abandonedAt: '2026-11-05T01:10:00Z', outOfRadius: true });
    expect(typesOf({ visible: [abandoned] })).not.toContain('GEOFENCE');
  });
});

describe('deriveAlerts — OUT_OF_WINDOW', () => {
  it('fires on the F03 flag and reports the tolerance only when exceeded', () => {
    // check-in at 02:00Z, window 08:00-17:00 Sydney = 21:00Z(prev)-06:00Z. Inside → minutes 0.
    const inside = makeStopRow({ appointmentId: 'A', startedAt: '2026-11-05T02:00:00Z', outOfWindow: true, timeSlotStart: '08:00', timeSlotEnd: '17:00', windowStartAt: '2026-11-04T21:00:00Z', windowEndAt: '2026-11-05T06:00:00Z' });
    const [a] = run({ visible: [inside] });
    expect(a).toMatchObject({ type: 'OUT_OF_WINDOW', minutes: 0, thresholdMinutes: null, thresholdSource: null });

    const early = makeStopRow({ ...inside, startedAt: '2026-11-04T20:00:00Z' }); // 60 min before window
    const [b] = run({ visible: [early] });
    expect(b).toMatchObject({ type: 'OUT_OF_WINDOW', minutes: 60, thresholdMinutes: 15, thresholdSource: 'PLATFORM' });
  });
  it('does not fire when the flag is false', () => {
    expect(typesOf({ visible: [makeStopRow({ appointmentId: 'A', startedAt: '2026-11-05T02:00:00Z', outOfWindow: false })] })).not.toContain(
      'OUT_OF_WINDOW',
    );
  });
});

describe('deriveAlerts — COMPLETION_REMINDER', () => {
  it('fires for a reminder whose stop is not finished and exits once finished', () => {
    const stop = makeStopRow({ appointmentId: '00000000-0000-4000-8000-000000000001', startedAt: '2026-11-05T01:00:00Z', finishedAt: null });
    const [a] = run({ visible: [stop], reminders: [makeReminderRow()] });
    expect(a).toMatchObject({ type: 'COMPLETION_REMINDER', appointmentId: '00000000-0000-4000-8000-000000000001' });

    const finished = makeStopRow({ ...stop, finishedAt: '2026-11-05T01:40:00Z' });
    expect(typesOf({ visible: [finished], reminders: [makeReminderRow()] })).not.toContain('COMPLETION_REMINDER');
  });
});

describe('deriveAlerts — ordering', () => {
  it('sorts by the severity order', () => {
    const stop = makeStopRow({ appointmentId: '00000000-0000-4000-8000-000000000001', startedAt: null, publishedServiceStartAt: '2026-11-05T00:00:00Z', windowStartAt: '2026-11-05T00:00:00Z' });
    const state: LiveDayInspectorState = 'IN_TRANSIT';
    const types = run({
      visible: [stop],
      reminders: [makeReminderRow()],
      events: [makeEventRow({ type: 'CANT_DO', appointmentId: 'OTHER', cantDoActive: true })],
      state,
    }).map((a) => a.type);
    // CANT_DO before COMPLETION_REMINDER before NOT_STARTED.
    expect(types.indexOf('CANT_DO')).toBeLessThan(types.indexOf('COMPLETION_REMINDER'));
    expect(types.indexOf('COMPLETION_REMINDER')).toBeLessThan(types.indexOf('NOT_STARTED'));
  });
});
