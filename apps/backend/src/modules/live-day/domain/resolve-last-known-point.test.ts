import { describe, it, expect } from 'vitest';
import { resolveLastKnownPoint, type LastKnownOriginInput } from './resolve-last-known-point';
import { makeStopRow } from './live-day-test-factories';
import type { LiveDayStopRow } from './live-day.read-repository';

const NO_ORIGIN: LastKnownOriginInput = {
  originSource: null,
  originLat: null,
  originLng: null,
  originOverrideLat: null,
  originOverrideLng: null,
  baseLat: null,
  baseLng: null,
};

const exec = (fields: Partial<LiveDayStopRow>): LiveDayStopRow =>
  makeStopRow({ appointmentId: fields.appointmentId ?? 'X', ...fields });

describe('resolveLastKnownPoint (§4, test 3)', () => {
  it('1. most recent is a check-out with finish coords -> CHECK_OUT finish coords', () => {
    const r = resolveLastKnownPoint(
      [exec({ appointmentId: 'A', startedAt: '2026-11-05T09:00:00Z', startLat: 1, startLng: 2, finishedAt: '2026-11-05T09:40:00Z', finishLat: 3, finishLng: 4 })],
      NO_ORIGIN,
    );
    expect(r).toMatchObject({ source: 'CHECK_OUT', lat: 3, lng: 4, at: '2026-11-05T09:40:00.000Z', appointmentId: 'A', label: null });
  });

  it('2. check-out without finish coords -> start coords of the same execution, source CHECK_OUT', () => {
    const r = resolveLastKnownPoint(
      [exec({ appointmentId: 'A', startedAt: '2026-11-05T09:00:00Z', startLat: 1, startLng: 2, finishedAt: '2026-11-05T09:40:00Z', finishLat: null, finishLng: null })],
      NO_ORIGIN,
    );
    expect(r).toMatchObject({ source: 'CHECK_OUT', lat: 1, lng: 2 });
  });

  it('3. most recent is a check-in -> CHECK_IN start coords', () => {
    const r = resolveLastKnownPoint(
      [
        exec({ appointmentId: 'A', startedAt: '2026-11-05T09:00:00Z', startLat: 1, startLng: 2, finishedAt: '2026-11-05T09:10:00Z', finishLat: 9, finishLng: 9 }),
        exec({ appointmentId: 'B', startedAt: '2026-11-05T10:00:00Z', startLat: 5, startLng: 6, finishedAt: null }),
      ],
      NO_ORIGIN,
    );
    expect(r).toMatchObject({ source: 'CHECK_IN', lat: 5, lng: 6, appointmentId: 'B' });
  });

  it('4. instant tie between check-out of X and check-in of Y -> CHECK_IN (Y)', () => {
    const r = resolveLastKnownPoint(
      [
        exec({ appointmentId: 'X', startedAt: '2026-11-05T08:00:00Z', startLat: 1, startLng: 1, finishedAt: '2026-11-05T09:00:00Z', finishLat: 2, finishLng: 2 }),
        exec({ appointmentId: 'Y', startedAt: '2026-11-05T09:00:00Z', startLat: 7, startLng: 8, finishedAt: null }),
      ],
      NO_ORIGIN,
    );
    expect(r).toMatchObject({ source: 'CHECK_IN', appointmentId: 'Y', lat: 7, lng: 8 });
  });

  it('5. only abandoned executions -> falls through to origin', () => {
    const r = resolveLastKnownPoint(
      [exec({ appointmentId: 'A', startedAt: '2026-11-05T08:00:00Z', startLat: 1, startLng: 2, abandonedAt: '2026-11-05T08:10:00Z' })],
      { ...NO_ORIGIN, originSource: 'BASE', originLat: -33.87, originLng: 151.2 },
    );
    expect(r).toMatchObject({ source: 'BASE', lat: -33.87, lng: 151.2, label: 'Base' });
  });

  it('6. no event, plan origin BASE -> BASE / "Base"', () => {
    const r = resolveLastKnownPoint([], { ...NO_ORIGIN, originSource: 'BASE', originLat: 10, originLng: 20 });
    expect(r).toEqual({ source: 'BASE', lat: 10, lng: 20, at: null, appointmentId: null, label: 'Base' });
  });

  it('7. no event, plan origin OVERRIDE -> BASE / "Start of day" from origin coords', () => {
    const r = resolveLastKnownPoint([], { ...NO_ORIGIN, originSource: 'OVERRIDE', originLat: 11, originLng: 21 });
    expect(r).toMatchObject({ source: 'BASE', lat: 11, lng: 21, label: 'Start of day' });
  });

  it('8. no event, no plan, profile base -> BASE / "Base"', () => {
    const r = resolveLastKnownPoint([], { ...NO_ORIGIN, originSource: null, baseLat: 12, baseLng: 22 });
    expect(r).toMatchObject({ source: 'BASE', lat: 12, lng: 22, label: 'Base' });
  });

  it('8b. LAST_STOP with day override -> BASE "Start of day" from override, never the stored origin coords', () => {
    const r = resolveLastKnownPoint([], {
      originSource: 'LAST_STOP',
      originLat: 999, // stored = last executed property; must NOT be used
      originLng: 999,
      originOverrideLat: 30,
      originOverrideLng: 40,
      baseLat: 50,
      baseLng: 60,
    });
    expect(r).toMatchObject({ source: 'BASE', lat: 30, lng: 40, label: 'Start of day' });
  });

  it('8b. LAST_STOP without override, profile base -> BASE "Base", never stored origin coords', () => {
    const r = resolveLastKnownPoint([], {
      originSource: 'LAST_STOP',
      originLat: 999,
      originLng: 999,
      originOverrideLat: null,
      originOverrideLng: null,
      baseLat: 50,
      baseLng: 60,
    });
    expect(r).toMatchObject({ source: 'BASE', lat: 50, lng: 60, label: 'Base' });
  });

  it('9. nothing -> NONE', () => {
    expect(resolveLastKnownPoint([], NO_ORIGIN)).toEqual({ source: 'NONE', lat: null, lng: null, at: null, appointmentId: null, label: null });
  });
});
