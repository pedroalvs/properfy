import { describe, it, expect } from 'vitest';
import { computeMetricFromFacts, type MetricContext } from './metrics';
import { buildFact, wallAt } from './__fixtures__/service-facts';
import type { ServiceFact } from './service-fact';

const D = '2026-11-10';
const CTX: MetricContext = {
  toleranceMinutes: 15,
  volumeReference: 9.5,
  minimumRatings: 3,
  from: '2026-11-01',
  to: '2026-11-30',
};

let seq = 0;
const uuid = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`;
const fact = (over: Partial<ServiceFact> = {}): ServiceFact =>
  buildFact({ inspectorId: 'x', appointmentId: uuid(), serviceDate: D, ...over });

describe('metric failures — detail strings (L-F07-06)', () => {
  it('PUNCTUALITY LATE with a published plan start', () => {
    const late = fact({
      outOfWindow: true,
      startedAt: wallAt(D, '11:20'),
      publishedServiceStartAt: wallAt(D, '10:50'),
    });
    const r = computeMetricFromFacts('PUNCTUALITY', [late], CTX);
    expect(r.failures[0]?.detail).toBe('Checked in 11:20, window 09:00–11:00, planned 10:50');
  });

  it('PUNCTUALITY EARLY without a plan', () => {
    const early = fact({ outOfWindow: true, startedAt: wallAt(D, '08:40') });
    const r = computeMetricFromFacts('PUNCTUALITY', [early], CTX);
    expect(r.failures[0]?.detail).toBe('Checked in 08:40, window 09:00–11:00');
  });

  it('PUNCTUALITY NO_SHOW variants', () => {
    const marked = computeMetricFromFacts('PUNCTUALITY', [fact({ kind: 'DONE_WITHOUT_EXECUTION' })], CTX);
    expect(marked.failures[0]?.detail).toBe('Marked done without check-in');
    const dropped = computeMetricFromFacts(
      'PUNCTUALITY',
      [fact({ kind: 'CANT_ATTEND', cantAttendNoticeAt: wallAt(D, '08:00') })],
      CTX,
    );
    expect(dropped.failures[0]?.detail).toBe("Dropped: can't attend");
    const noShow = computeMetricFromFacts('PUNCTUALITY', [fact({ kind: 'NO_SHOW_REJECTED' })], CTX);
    expect(noShow.failures[0]?.detail).toBe("Rejected: inspector didn't attend");
  });

  it('GEOFENCE MISS reports the distance and radius', () => {
    const miss = fact({ outOfRadius: true, geolocationDistanceMeters: 420, startAccuracyM: 40, geofenceRadiusM: 300 });
    const r = computeMetricFromFacts('GEOFENCE', [miss], CTX);
    expect(r.failures[0]?.detail).toBe('Check-in 420 m from the property (radius 300 m)');
  });

  it('NO_STUCK reports the duration', () => {
    const stuck = fact({ startedAt: wallAt(D, '09:00'), finishedAt: wallAt(D, '16:10') });
    const r = computeMetricFromFacts('NO_STUCK', [stuck], CTX);
    expect(r.failures[0]?.detail).toBe('Finished 7h 10m after check-in');
  });

  it('SATISFACTION reports only ratings ≤ 2', () => {
    const facts = [fact({ rating: 2 }), fact({ rating: 3 }), fact({ rating: 5 })];
    const r = computeMetricFromFacts('SATISFACTION', facts, { ...CTX, minimumRatings: 1 });
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]?.detail).toBe('Rated 2 / 5');
  });

  it('LATE_NOTICE reports the deadline', () => {
    const late = fact({
      outOfWindow: true,
      startedAt: wallAt(D, '11:20'),
      publishedEtaAt: wallAt(D, '10:50'),
      publishedServiceStartAt: wallAt(D, '10:50'),
      lateNotices: [],
    });
    const r = computeMetricFromFacts('LATE_NOTICE', [late], CTX);
    expect(r.failures[0]?.detail).toBe('Late without notice before 10:50');
  });

  it('DONE_REJECTED reports the rejection', () => {
    const rejected = fact({ origin: 'REJECTED_DONE', doneRejected: true });
    const r = computeMetricFromFacts('DONE_REJECTED', [rejected], CTX);
    expect(r.failures[0]?.detail).toBe('Rejected after completion: not carried out');
  });

  it('a success is never a failure', () => {
    expect(computeMetricFromFacts('PUNCTUALITY', [fact()], CTX).failures).toEqual([]);
    expect(computeMetricFromFacts('GEOFENCE', [fact()], CTX).failures).toEqual([]);
  });

  it('VOLUME never carries failures', () => {
    const facts = Array.from({ length: 5 }, () => fact());
    expect(computeMetricFromFacts('VOLUME', facts, CTX).failures).toEqual([]);
  });
});

describe('metric failures — cap and privacy', () => {
  it('caps at 20, most recent first, keeping the true count', () => {
    const facts = Array.from({ length: 25 }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      const serviceDate = `2026-11-${day}`;
      return fact({ serviceDate, outOfWindow: true, startedAt: wallAt(serviceDate, '11:20') });
    });
    const r = computeMetricFromFacts('PUNCTUALITY', facts, CTX);
    expect(r.failureCount).toBe(25);
    expect(r.failures).toHaveLength(20);
    expect(r.failures[0]?.serviceDate).toBe('2026-11-25');
    expect(r.failures[19]?.serviceDate).toBe('2026-11-06');
  });

  it('every detail is ≤ 80 chars and carries no coordinate', () => {
    const facts = [
      fact({ outOfWindow: true, startedAt: wallAt(D, '11:20'), publishedServiceStartAt: wallAt(D, '10:50') }),
      fact({ outOfRadius: true, geolocationDistanceMeters: 420, startAccuracyM: 40 }),
      fact({ kind: 'CANT_ATTEND', cantAttendNoticeAt: wallAt(D, '08:00') }),
    ];
    for (const m of ['PUNCTUALITY', 'GEOFENCE', 'CANT_ATTEND'] as const) {
      for (const f of computeMetricFromFacts(m, facts, CTX).failures) {
        expect(f.detail.length).toBeLessThanOrEqual(80);
        expect(f.detail).not.toMatch(/-?\d{1,3}\.\d{3,}/); // no decimal-degree coordinate
      }
    }
  });
});
