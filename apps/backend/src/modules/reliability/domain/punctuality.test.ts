import { describe, it, expect } from 'vitest';
import { evaluatePunctuality } from './punctuality';
import { buildFact, wallAt } from './__fixtures__/service-facts';

const D = '2026-11-10';
const DMINUS1 = '2026-11-09';
const DPLUS1 = '2026-11-11';
const OPTS = { toleranceMinutes: 15 };

describe('evaluatePunctuality', () => {
  it('is PUNCTUAL inside the window', () => {
    expect(evaluatePunctuality(buildFact({ outOfWindow: false }), OPTS)).toBe('PUNCTUAL');
  });

  it('is LATE out of window with no published arrival', () => {
    const fact = buildFact({ outOfWindow: true, startedAt: wallAt(D, '11:20') });
    expect(evaluatePunctuality(fact, OPTS)).toBe('LATE');
  });

  it('is PUNCTUAL out of window but within the published service start + tolerance', () => {
    const fact = buildFact({
      outOfWindow: true,
      startedAt: wallAt(D, '11:20'),
      publishedEtaAt: wallAt(D, '11:10'),
      publishedServiceStartAt: wallAt(D, '11:10'),
    });
    expect(evaluatePunctuality(fact, OPTS)).toBe('PUNCTUAL');
  });

  it('is LATE out of window and after the published service start + tolerance', () => {
    const fact = buildFact({
      outOfWindow: true,
      startedAt: wallAt(D, '11:26'),
      publishedServiceStartAt: wallAt(D, '11:10'),
    });
    expect(evaluatePunctuality(fact, OPTS)).toBe('LATE');
  });

  it('is LATE when the published start is inside the window (no rescue)', () => {
    const fact = buildFact({
      outOfWindow: true,
      startedAt: wallAt(D, '11:20'),
      publishedServiceStartAt: wallAt(D, '10:30'),
    });
    expect(evaluatePunctuality(fact, OPTS)).toBe('LATE');
  });

  it('is EARLY when started before the window start minus tolerance (never rescued)', () => {
    const fact = buildFact({ outOfWindow: true, startedAt: wallAt(D, '08:40') });
    expect(evaluatePunctuality(fact, OPTS)).toBe('EARLY');
  });

  it('is LATE when checking in the day after the scheduled day', () => {
    const fact = buildFact({ outOfWindow: true, startedAt: wallAt(DPLUS1, '09:30') });
    expect(evaluatePunctuality(fact, OPTS)).toBe('LATE');
  });

  it('uses a plausible client time over the server start', () => {
    const fact = buildFact({
      outOfWindow: true,
      startClientAt: wallAt(D, '11:05'),
      startedAt: wallAt(D, '11:40'),
      publishedServiceStartAt: wallAt(D, '11:00'),
    });
    expect(evaluatePunctuality(fact, OPTS)).toBe('PUNCTUAL');
  });

  it('is NO_SHOW for a DONE without execution', () => {
    expect(evaluatePunctuality(buildFact({ kind: 'DONE_WITHOUT_EXECUTION' }), OPTS)).toBe('NO_SHOW');
  });

  it('is NO_SHOW for a same-day CANT_ATTEND', () => {
    const fact = buildFact({ kind: 'CANT_ATTEND', cantAttendNoticeAt: wallAt(D, '08:00') });
    expect(evaluatePunctuality(fact, OPTS)).toBe('NO_SHOW');
  });

  it('is NO_SHOW for a CANT_ATTEND 23h59 before the window', () => {
    const fact = buildFact({ kind: 'CANT_ATTEND', cantAttendNoticeAt: wallAt(DMINUS1, '09:01') });
    expect(evaluatePunctuality(fact, OPTS)).toBe('NO_SHOW');
  });

  it('is NO_SHOW for a CANT_ATTEND exactly 24h before (strictly-before boundary)', () => {
    const fact = buildFact({ kind: 'CANT_ATTEND', cantAttendNoticeAt: wallAt(DMINUS1, '09:00') });
    expect(evaluatePunctuality(fact, OPTS)).toBe('NO_SHOW');
  });

  it('is NOT_EVALUABLE for a CANT_ATTEND warned more than 24h ahead', () => {
    expect(
      evaluatePunctuality(buildFact({ kind: 'CANT_ATTEND', cantAttendNoticeAt: wallAt(DMINUS1, '08:59') }), OPTS),
    ).toBe('NOT_EVALUABLE');
    expect(
      evaluatePunctuality(buildFact({ kind: 'CANT_ATTEND', cantAttendNoticeAt: wallAt('2026-10-31', '09:00') }), OPTS),
    ).toBe('NOT_EVALUABLE');
  });

  it('is NO_SHOW for an OP-marked no-show', () => {
    expect(evaluatePunctuality(buildFact({ kind: 'NO_SHOW_REJECTED' }), OPTS)).toBe('NO_SHOW');
  });

  it('is NOT_EVALUABLE for a pre-F03 execution (null radius)', () => {
    expect(evaluatePunctuality(buildFact({ geofenceRadiusM: null }), OPTS)).toBe('NOT_EVALUABLE');
  });

  it('is PUNCTUAL for a late implausible client-time sync stored as in-window (R1)', () => {
    const fact = buildFact({
      outOfWindow: false,
      startClientAt: wallAt('2026-10-31', '09:30'),
      startedAt: wallAt(D, '11:40'),
    });
    expect(evaluatePunctuality(fact, OPTS)).toBe('PUNCTUAL');
  });

  it('is LATE post-F03 without property coordinates (radius present makes it evaluable)', () => {
    const fact = buildFact({
      geofenceRadiusM: 300,
      geolocationDistanceMeters: null,
      finishGeolocationDistanceMeters: null,
      outOfWindow: true,
      startedAt: wallAt(D, '11:20'),
    });
    expect(evaluatePunctuality(fact, OPTS)).toBe('LATE');
  });
});
