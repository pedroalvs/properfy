import { describe, it, expect } from 'vitest';
import { computeDayPlanFingerprint } from '../../day-plan/domain/day-plan-fingerprint';
import {
  configuredFingerprintOrigin,
  resolvePlanFreshness,
  type PlanFreshnessInput,
} from './plan-freshness';
import { makeStopRow } from './live-day-test-factories';
import type { LiveDayStopRow } from './live-day.read-repository';

const ORIGIN = { source: 'BASE' as const, lat: -33.87, lng: 151.2 };

/** The fingerprint the stored plan would carry for these rows + origin (F04's formula). */
function freshFingerprint(rows: LiveDayStopRow[]): string {
  return computeDayPlanFingerprint({
    origin: ORIGIN,
    stops: rows.map((r) => ({
      appointmentId: r.appointmentId,
      scheduledDate: r.scheduledDate,
      timeSlotStart: r.timeSlotStart,
      timeSlotEnd: r.timeSlotEnd,
      tenantTimezone: r.tenantTimezone,
      durationMinutes: r.defaultDurationMinutes,
      lat: r.propertyLat,
      lng: r.propertyLng,
      startedAt: r.startedAt === null ? null : new Date(r.startedAt),
      abandonedAt: r.abandonedAt === null ? null : new Date(r.abandonedAt),
    })),
  });
}

const base = (rows: LiveDayStopRow[], over: Partial<PlanFreshnessInput> = {}): PlanFreshnessInput => ({
  planId: '00000000-0000-4000-8000-0000000000c1',
  storedStatus: 'PUBLISHED',
  storedFingerprint: freshFingerprint(rows),
  origin: ORIGIN,
  visibleStops: rows,
  ...over,
});

describe('resolvePlanFreshness (D17, test 9b)', () => {
  const rows = [
    makeStopRow({ appointmentId: 'A', sequence: 1, propertyLat: -33.88, propertyLng: 151.21 }),
    makeStopRow({ appointmentId: 'B', sequence: 2, propertyLat: -33.89, propertyLng: 151.22 }),
  ];

  it('no plan -> NONE / not out of date', () => {
    expect(resolvePlanFreshness(base(rows, { planId: null }))).toEqual({
      planStatus: 'NONE',
      routeOutOfDate: false,
    });
  });

  it('matching fingerprint -> stored status, not out of date', () => {
    expect(resolvePlanFreshness(base(rows))).toEqual({
      planStatus: 'PUBLISHED',
      routeOutOfDate: false,
    });
  });

  it('a check-out (SCHEDULED -> DONE of an already-started stop) does NOT flip STALE (L-F04-01)', () => {
    // started + finished collapses to execState STARTED, same as when it was IN_PROGRESS.
    const started = [
      makeStopRow({ ...rows[0]!, startedAt: '2026-11-05T09:00:00Z' }),
      rows[1]!,
    ];
    const fp = freshFingerprint(started); // fingerprint while IN_PROGRESS
    const finished = [
      makeStopRow({ ...started[0]!, status: 'DONE', finishedAt: '2026-11-05T09:40:00Z' }),
      rows[1]!,
    ];
    expect(resolvePlanFreshness(base(finished, { storedFingerprint: fp })).planStatus).toBe('PUBLISHED');
  });

  it('an event-less edit (time_slot_start) -> STALE / out of date', () => {
    const edited = [makeStopRow({ ...rows[0]!, timeSlotStart: '13:00' }), rows[1]!];
    expect(resolvePlanFreshness(base(edited, { storedFingerprint: freshFingerprint(rows) }))).toEqual({
      planStatus: 'STALE',
      routeOutOfDate: true,
    });
  });

  it('a newly assigned (out-of-plan) stop -> STALE', () => {
    const withExtra = [...rows, makeStopRow({ appointmentId: 'C', sequence: null })];
    expect(resolvePlanFreshness(base(withExtra, { storedFingerprint: freshFingerprint(rows) })).planStatus).toBe(
      'STALE',
    );
  });

  it('stored status STALE is honored even when the fingerprint matches', () => {
    expect(resolvePlanFreshness(base(rows, { storedStatus: 'STALE' }))).toEqual({
      planStatus: 'STALE',
      routeOutOfDate: true,
    });
  });

  it('a DRAFT plan with a matching fingerprint stays DRAFT', () => {
    expect(resolvePlanFreshness(base(rows, { storedStatus: 'DRAFT' })).planStatus).toBe('DRAFT');
  });
});

describe('configuredFingerprintOrigin (override -> base -> none, never LAST_STOP)', () => {
  it('prefers the day override', () => {
    expect(
      configuredFingerprintOrigin({ originOverrideLat: 1, originOverrideLng: 2, baseLat: 9, baseLng: 9 }),
    ).toEqual({ source: 'OVERRIDE', lat: 1, lng: 2 });
  });
  it('falls back to the profile base', () => {
    expect(
      configuredFingerprintOrigin({ originOverrideLat: null, originOverrideLng: null, baseLat: 3, baseLng: 4 }),
    ).toEqual({ source: 'BASE', lat: 3, lng: 4 });
  });
  it('is NONE with neither', () => {
    expect(
      configuredFingerprintOrigin({ originOverrideLat: null, originOverrideLng: null, baseLat: null, baseLng: null }),
    ).toEqual({ source: 'NONE', lat: null, lng: null });
  });
});
