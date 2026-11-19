import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  computeDayPlanFingerprint,
  type FingerprintInput,
  type FingerprintStop,
} from '../day-plan-fingerprint';

const stop = (over: Partial<FingerprintStop> & { appointmentId: string }): FingerprintStop => ({
  scheduledDate: '2026-11-05',
  timeSlotStart: '08:00',
  timeSlotEnd: '17:00',
  tenantTimezone: 'Australia/Sydney',
  durationMinutes: 45,
  lat: -33.8836,
  lng: 151.2108,
  startedAt: null,
  abandonedAt: null,
  ...over,
});

const base = (): FingerprintInput => ({
  origin: { source: 'BASE', lat: -33.87, lng: 151.2 },
  stops: [stop({ appointmentId: 'A' }), stop({ appointmentId: 'B', lat: -33.9, lng: 151.1 })],
});

describe('computeDayPlanFingerprint', () => {
  it('is stable for the same input', () => {
    expect(computeDayPlanFingerprint(base())).toBe(computeDayPlanFingerprint(base()));
  });

  it('ignores the order of appointments in the input', () => {
    const a = base();
    const b: FingerprintInput = { origin: a.origin, stops: [...a.stops].reverse() };
    expect(computeDayPlanFingerprint(a)).toBe(computeDayPlanFingerprint(b));
  });

  it.each([
    ['time slot start', (i: FingerprintInput) => { i.stops[0]!.timeSlotStart = '09:00'; }],
    ['scheduled date', (i: FingerprintInput) => { i.stops[0]!.scheduledDate = '2026-11-06'; }],
    ['property coordinate', (i: FingerprintInput) => { i.stops[0]!.lat = -34; }],
    ['service duration', (i: FingerprintInput) => { i.stops[0]!.durationMinutes = 60; }],
    ['agency timezone', (i: FingerprintInput) => { i.stops[0]!.tenantTimezone = 'Australia/Perth'; }],
    ['origin coordinate', (i: FingerprintInput) => { i.origin.lat = -34; }],
    ['origin source', (i: FingerprintInput) => { i.origin.source = 'OVERRIDE'; }],
    ['appointment set', (i: FingerprintInput) => { i.stops.push(stop({ appointmentId: 'C' })); }],
    ['check-in (startedAt)', (i: FingerprintInput) => { i.stops[0]!.startedAt = new Date('2026-11-05T21:05:00Z'); }],
  ])('changes when %s changes', (_label, mutate) => {
    const before = computeDayPlanFingerprint(base());
    const input = base();
    mutate(input);
    expect(computeDayPlanFingerprint(input)).not.toBe(before);
  });

  it('abandonment returns a started stop to NOT_STARTED and changes the hash vs. started', () => {
    const started = base();
    started.stops[0]!.startedAt = new Date('2026-11-05T21:05:00Z');
    const abandoned = base();
    abandoned.stops[0]!.startedAt = new Date('2026-11-05T21:05:00Z');
    abandoned.stops[0]!.abandonedAt = new Date('2026-11-05T21:10:00Z');
    expect(computeDayPlanFingerprint(abandoned)).not.toBe(computeDayPlanFingerprint(started));
    // An abandoned stop hashes the same as a never-started one (back to NOT_STARTED).
    expect(computeDayPlanFingerprint(abandoned)).toBe(computeDayPlanFingerprint(base()));
  });

  it('does NOT change on check-out of a started stop (finishedAt is not an input)', () => {
    const started = base();
    started.stops[0]!.startedAt = new Date('2026-11-05T21:05:00Z');
    const before = computeDayPlanFingerprint(started);
    // A check-out sets finished_at, which the fingerprint deliberately ignores: same startedAt, not abandoned.
    const checkedOut = base();
    checkedOut.stops[0]!.startedAt = new Date('2026-11-05T21:05:00Z');
    expect(computeDayPlanFingerprint(checkedOut)).toBe(before);
  });

  it('does not import @prisma/client (pure domain, reusable by F05)', () => {
    const source = readFileSync(fileURLToPath(new URL('../day-plan-fingerprint.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/from\s+['"]@prisma\/client['"]/);
  });
});
