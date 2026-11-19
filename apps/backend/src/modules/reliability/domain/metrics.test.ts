import { describe, it, expect } from 'vitest';
import type { ReliabilityMetricKey } from '@properfy/shared';
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
const fact = (inspectorId: string, over: Partial<ServiceFact> = {}): ServiceFact =>
  buildFact({ inspectorId, appointmentId: uuid(), serviceDate: D, ...over });

const metric = (m: ReliabilityMetricKey, facts: ServiceFact[], ctx: MetricContext = CTX) =>
  computeMetricFromFacts(m, facts, ctx);

function ana(): ServiceFact[] {
  const facts = Array.from({ length: 10 }, () => fact('ana'));
  facts[0]!.rating = 5;
  facts[1]!.rating = 5;
  facts[2]!.rating = 4;
  facts[3]!.rating = 3;
  // one geofence miss
  facts[4]!.outOfRadius = true;
  facts[4]!.geolocationDistanceMeters = 420;
  facts[4]!.startAccuracyM = 40;
  // L1 — LATE, published plan stop, notified in advance (10:30 < ETA 10:50)
  facts.push(
    fact('ana', {
      outOfWindow: true,
      startedAt: wallAt(D, '11:20'),
      publishedEtaAt: wallAt(D, '10:50'),
      publishedServiceStartAt: wallAt(D, '10:50'),
      lateNotices: [{ clientOccurredAt: null, createdAt: wallAt(D, '10:30') }],
    }),
  );
  // L2 — LATE, no plan, notice after the window start (not in advance)
  facts.push(
    fact('ana', {
      outOfWindow: true,
      startedAt: wallAt(D, '11:40'),
      lateNotices: [{ clientOccurredAt: null, createdAt: wallAt(D, '09:20') }],
    }),
  );
  return facts;
}

describe('computeMetricFromFacts — Ana (full worked example)', () => {
  const a = ana();
  it('PUNCTUALITY 0.8333 (10/12), weightedSuccess 600 / weightedEligible 720', () => {
    const r = metric('PUNCTUALITY', a);
    expect(r.rate).toBe(0.8333);
    expect(r.eligibleCount).toBe(12);
    expect(r.successCount).toBe(10);
    expect(r.weightedSuccess).toBe(600);
    expect(r.weightedEligible).toBe(720);
    expect(r.volume).toBe(12);
  });
  it('GEOFENCE 0.9167 (11/12)', () => {
    const r = metric('GEOFENCE', a);
    expect(r.rate).toBe(0.9167);
    expect(r.eligibleCount).toBe(12);
    expect(r.successCount).toBe(11);
  });
  it('NO_STUCK 1', () => {
    expect(metric('NO_STUCK', a).rate).toBe(1);
  });
  it('SATISFACTION 0.8125, averageRating 4.25, successCount null', () => {
    const r = metric('SATISFACTION', a);
    expect(r.rate).toBe(0.8125);
    expect(r.eligibleCount).toBe(4);
    expect(r.successCount).toBeNull();
    expect(r.averageRating).toBe(4.25);
  });
  it('LATE_NOTICE 0.5 (1 of 2 late notified in advance)', () => {
    const r = metric('LATE_NOTICE', a);
    expect(r.rate).toBe(0.5);
    expect(r.eligibleCount).toBe(2);
    expect(r.successCount).toBe(1);
  });
  it('CANT_ATTEND 1', () => {
    expect(metric('CANT_ATTEND', a).rate).toBe(1);
  });
  it('VOLUME 1 (12/9.5 capped), reference 9.5, activeDays 30', () => {
    const r = metric('VOLUME', a);
    expect(r.rate).toBe(1);
    expect(r.eligibleCount).toBe(12);
    expect(r.successCount).toBe(12);
    expect(r.volumeReference).toBe(9.5);
    expect(r.weightedSuccess).toBe(12);
    expect(r.weightedEligible).toBe(9.5);
    expect(r.activeDays).toBe(30);
    expect(r.failures).toEqual([]);
  });
  it('DONE_REJECTED 1', () => {
    expect(metric('DONE_REJECTED', a).rate).toBe(1);
  });
});

describe('computeMetricFromFacts — Ben (normalization)', () => {
  function ben(): ServiceFact[] {
    const routine = Array.from({ length: 8 }, () =>
      fact('ben', { durationMinutes: 30, plannedTravelMinutes: 10 }),
    );
    const entry = Array.from({ length: 2 }, () =>
      fact('ben', {
        durationMinutes: 120,
        plannedTravelMinutes: 20,
        outOfWindow: true,
        startedAt: wallAt(D, '11:40'),
      }),
    );
    return [...routine, ...entry];
  }
  const b = ben();
  it('PUNCTUALITY 0.5333 weighted (would be 0.8 unweighted)', () => {
    const r = metric('PUNCTUALITY', b);
    expect(r.rate).toBe(0.5333);
    expect(r.eligibleCount).toBe(10);
    expect(r.successCount).toBe(8);
    expect(r.weightedSuccess).toBe(320);
    expect(r.weightedEligible).toBe(600);
  });
  it('VOLUME 1 (10/9.5 capped)', () => {
    expect(metric('VOLUME', b).rate).toBe(1);
  });
  it('LATE_NOTICE 0 (2 late, none notified)', () => {
    const r = metric('LATE_NOTICE', b);
    expect(r.rate).toBe(0);
    expect(r.eligibleCount).toBe(2);
  });
});

describe('computeMetricFromFacts — Dan (mixed universe)', () => {
  function dan(): ServiceFact[] {
    const executed = Array.from({ length: 7 }, () => fact('dan'));
    const doneWithout = fact('dan', { kind: 'DONE_WITHOUT_EXECUTION', origin: 'CURRENT_DONE', startedAt: null, finishedAt: null });
    const cantAttend = Array.from({ length: 2 }, () =>
      fact('dan', { kind: 'CANT_ATTEND', origin: 'CANT_ATTEND', cantAttendNoticeAt: wallAt(D, '08:00') }),
    );
    return [...executed, doneWithout, ...cantAttend];
  }
  const d = dan();
  it('PUNCTUALITY 0.7 (7 of 10)', () => {
    expect(metric('PUNCTUALITY', d).rate).toBe(0.7);
  });
  it('GEOFENCE 1 (only the 7 EXECUTED are eligible)', () => {
    const r = metric('GEOFENCE', d);
    expect(r.rate).toBe(1);
    expect(r.eligibleCount).toBe(7);
    expect(r.successCount).toBe(7);
  });
  it('CANT_ATTEND 0.8 (2 faults of 10)', () => {
    const r = metric('CANT_ATTEND', d);
    expect(r.rate).toBe(0.8);
    expect(r.eligibleCount).toBe(10);
    expect(r.successCount).toBe(8);
  });
  it('VOLUME 0.8421 (8 completed / 9.5)', () => {
    expect(metric('VOLUME', d).rate).toBe(0.8421);
  });
  it('DONE_REJECTED 1 (8 occurrences)', () => {
    const r = metric('DONE_REJECTED', d);
    expect(r.rate).toBe(1);
    expect(r.eligibleCount).toBe(8);
  });
  it('SATISFACTION and LATE_NOTICE null', () => {
    expect(metric('SATISFACTION', d).rate).toBeNull();
    expect(metric('LATE_NOTICE', d).rate).toBeNull();
  });
});

describe('computeMetricFromFacts — Eva, Fábio, Gil, Hugo', () => {
  it('Eva: VOLUME 1, SATISFACTION and LATE_NOTICE null', () => {
    const eva = Array.from({ length: 10 }, () => fact('eva'));
    expect(metric('VOLUME', eva).rate).toBe(1);
    expect(metric('SATISFACTION', eva).rate).toBeNull();
    expect(metric('LATE_NOTICE', eva).rate).toBeNull();
    expect(metric('VOLUME', eva).volume).toBe(10);
  });

  it('Fábio: DONE_REJECTED 0.9 (1 of 10 rejected), VOLUME 0.9474 (9 completed)', () => {
    const fabio = Array.from({ length: 9 }, () => fact('fabio'));
    fabio.push(fact('fabio', { origin: 'REJECTED_DONE', doneRejected: true }));
    const dr = metric('DONE_REJECTED', fabio);
    expect(dr.rate).toBe(0.9);
    expect(dr.eligibleCount).toBe(10);
    expect(dr.successCount).toBe(9);
    expect(metric('VOLUME', fabio).rate).toBe(0.9474);
    expect(metric('VOLUME', fabio).volume).toBe(10);
  });

  it('Gil: 9 DONE + 1 NO_SHOW_REJECTED', () => {
    const gil = Array.from({ length: 9 }, () => fact('gil'));
    gil.push(fact('gil', { kind: 'NO_SHOW_REJECTED', origin: 'NO_SHOW_REJECTED', startedAt: null, finishedAt: null }));
    expect(metric('PUNCTUALITY', gil).rate).toBe(0.9);
    expect(metric('CANT_ATTEND', gil).rate).toBe(0.9);
    expect(metric('VOLUME', gil).rate).toBe(0.9474);
    const dr = metric('DONE_REJECTED', gil);
    expect(dr.rate).toBe(1);
    expect(dr.eligibleCount).toBe(9);
  });

  it('Hugo: 10 DONE + 1 CANT_ATTEND with 3 days notice', () => {
    const hugo = Array.from({ length: 10 }, () => fact('hugo'));
    hugo.push(
      fact('hugo', { kind: 'CANT_ATTEND', origin: 'CANT_ATTEND', cantAttendNoticeAt: wallAt('2026-11-07', '09:00') }),
    );
    const p = metric('PUNCTUALITY', hugo);
    expect(p.rate).toBe(1); // early CANT_ATTEND is NOT_EVALUABLE, leaves metric 1
    expect(p.eligibleCount).toBe(10);
    expect(metric('CANT_ATTEND', hugo).rate).toBe(0.9091); // still a fault in metric 6 (10 of 11)
  });
});

describe('computeMetricFromFacts — SATISFACTION minimum ratings (L-F07-03)', () => {
  const evaExecuted = () => Array.from({ length: 10 }, () => fact('eva'));

  it('is null with 1 rating below minimumRatings 3, keeping averageRating', () => {
    const facts = evaExecuted();
    facts[0]!.rating = 1;
    const r = metric('SATISFACTION', facts);
    expect(r.rate).toBeNull();
    expect(r.eligibleCount).toBe(1);
    expect(r.averageRating).toBe(1);
  });

  it('is null with 2 ratings (1,5), averageRating 3', () => {
    const facts = evaExecuted();
    facts[0]!.rating = 1;
    facts[1]!.rating = 5;
    const r = metric('SATISFACTION', facts);
    expect(r.rate).toBeNull();
    expect(r.eligibleCount).toBe(2);
    expect(r.averageRating).toBe(3);
  });

  it('computes with 3 ratings (1,5,5) → 0.6667', () => {
    const facts = evaExecuted();
    facts[0]!.rating = 1;
    facts[1]!.rating = 5;
    facts[2]!.rating = 5;
    expect(metric('SATISFACTION', facts).rate).toBe(0.6667);
  });

  it('computes a single rating when minimumRatings is 1 → 0', () => {
    const facts = evaExecuted();
    facts[0]!.rating = 1;
    expect(metric('SATISFACTION', facts, { ...CTX, minimumRatings: 1 }).rate).toBe(0);
  });
});

describe('computeMetricFromFacts — late rejection only counts in metric 8 (L-F07-07)', () => {
  it('keeps volume and other metrics at the normal count while DONE_REJECTED includes the late fact', () => {
    const eva = Array.from({ length: 10 }, () => fact('eva'));
    eva.push(fact('eva', { origin: 'REJECTED_DONE', doneRejected: true, lateRejection: true, serviceDate: '2026-11-05' }));
    const dr = metric('DONE_REJECTED', eva);
    expect(dr.rate).toBe(0.9091); // 10 of 11
    expect(dr.eligibleCount).toBe(11);
    expect(dr.volume).toBe(10);
    expect(metric('VOLUME', eva).eligibleCount).toBe(10);
    expect(metric('PUNCTUALITY', eva).eligibleCount).toBe(10);
  });
});

describe('computeMetricFromFacts — empty universe', () => {
  it('VOLUME rate 0, other metrics null, volume 0', () => {
    expect(metric('VOLUME', []).rate).toBe(0);
    expect(metric('PUNCTUALITY', []).rate).toBeNull();
    expect(metric('DONE_REJECTED', []).rate).toBeNull();
    expect(metric('VOLUME', []).volume).toBe(0);
  });
});
