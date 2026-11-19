import { describe, it, expect } from 'vitest';
import { projectStopEta } from '@properfy/shared';
import { toEtaPlanInput, toEtaRealEvents } from './to-eta-inputs';
import { makeInspectorRow, makeStopRow, makeEventRow } from './live-day-test-factories';

const planRow = (appointmentId: string, sequence: number, over = {}) =>
  makeStopRow({ appointmentId, sequence, ...over });

describe('toEtaPlanInput (L-F05-10)', () => {
  const row = makeInspectorRow({
    planId: '00000000-0000-4000-8000-0000000000c1',
    planVersion: 7,
    planTimezone: 'Australia/Sydney',
    originSource: 'BASE',
    departureAt: '2026-11-04T20:30:00.000Z',
    approximate: false,
  });
  const stops = [planRow('A', 1), planRow('B', 2)];

  it('maps the plan header and stop fields', () => {
    const input = toEtaPlanInput(row, stops, '2026-11-05');
    expect(input).toMatchObject({
      dayPlanId: '00000000-0000-4000-8000-0000000000c1',
      planVersion: 7,
      planDate: '2026-11-05',
      timezone: 'Australia/Sydney',
      hasOrigin: true,
      approximate: false,
    });
    expect(input.departureAt).toEqual(new Date('2026-11-04T20:30:00.000Z'));
    expect(input.stops).toHaveLength(2);
    expect(input.stops[0]).toMatchObject({
      appointmentId: 'A',
      sequence: 1,
      appointmentStatus: 'SCHEDULED',
      durationMinutes: 45,
    });
    expect(input.stops[0]!.windowStartAt).toBeInstanceOf(Date);
  });

  it('hasOrigin is false for origin source NONE', () => {
    expect(toEtaPlanInput(makeInspectorRow({ originSource: 'NONE' }), stops, '2026-11-05').hasOrigin).toBe(false);
  });
});

describe('toEtaRealEvents', () => {
  it('includes started executions and excludes abandoned check-ins (D18)', () => {
    const rows = [
      makeStopRow({ appointmentId: 'A', startedAt: '2026-11-05T09:00:00Z', finishedAt: '2026-11-05T09:40:00Z' }),
      makeStopRow({ appointmentId: 'B', startedAt: '2026-11-05T08:00:00Z', abandonedAt: '2026-11-05T08:10:00Z' }),
      makeStopRow({ appointmentId: 'C', startedAt: null }),
    ];
    const { executions } = toEtaRealEvents(rows, []);
    expect(executions.has('A')).toBe(true);
    expect(executions.get('A')).toEqual({
      startedAt: new Date('2026-11-05T09:00:00Z'),
      finishedAt: new Date('2026-11-05T09:40:00Z'),
    });
    expect(executions.has('B')).toBe(false); // abandoned
    expect(executions.has('C')).toBe(false); // not started
  });

  it('keeps the latest-of-day late notice per appointment', () => {
    const events = [
      makeEventRow({ type: 'LATE_NOTICE', appointmentId: 'A', minutes: 10, createdAt: '2026-11-05T09:00:00Z' }),
      makeEventRow({ type: 'LATE_NOTICE', appointmentId: 'A', minutes: 25, createdAt: '2026-11-05T10:00:00Z' }),
      makeEventRow({ type: 'CANT_DO', appointmentId: 'A', minutes: null, createdAt: '2026-11-05T11:00:00Z' }),
    ];
    const { lateNotices } = toEtaRealEvents([], events);
    expect(lateNotices.get('A')).toMatchObject({ minutesLate: 25 });
  });
});

describe('end-to-end with the real projectStopEta', () => {
  it('projects a start time for a pending stop', () => {
    const row = makeInspectorRow({ originSource: 'BASE', departureAt: '2026-11-05T08:00:00.000Z' });
    const stops = [
      planRow('A', 1, { startedAt: '2026-11-05T08:10:00Z', finishedAt: '2026-11-05T08:50:00Z', status: 'DONE' }),
      planRow('B', 2, { startedAt: null }),
    ];
    const plan = toEtaPlanInput(row, stops, '2026-11-05');
    const events = toEtaRealEvents(stops, []);
    const projected = projectStopEta(plan, events, new Date('2026-11-05T09:00:00Z'));
    const b = projected.find((p) => p.appointmentId === 'B');
    expect(b?.projectedStartAt).toBeInstanceOf(Date);
  });
});
