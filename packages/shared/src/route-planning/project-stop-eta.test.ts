import { describe, expect, it } from 'vitest';

import { evaluateSequence } from './evaluate-sequence';
import {
  etaPlanInputFromDayPlanResponse,
  isProjectedLate,
  projectStopEta,
  type EtaPlanInput,
  type EtaPlanStop,
  type EtaRealEvents,
} from './project-stop-eta';
import { DEFAULT_ROUTE_WEIGHTS, type OptimizerInput } from './types';

// ---------------------------------------------------------------------------
// Fixture — agency `ag-syd` (Australia/Sydney, AEDT = UTC+11 in November),
// civil date 2026-11-05. Plan of inspector insp-1, origin at base,
// departure_at 07:40, saved order A, B, C. All times below are Sydney local.
// ---------------------------------------------------------------------------
const TZ = 'Australia/Sydney';
const DATE = '2026-11-05';
const at = (iso: string): Date => new Date(iso);

// Sydney local → UTC instants
const L = {
  dep0740: at('2026-11-04T20:40:00.000Z'),
  winA: [at('2026-11-04T21:00:00.000Z'), at('2026-11-04T23:00:00.000Z')] as const, // 08:00–10:00
  winB: [at('2026-11-04T22:00:00.000Z'), at('2026-11-05T01:00:00.000Z')] as const, // 09:00–12:00
  winC: [at('2026-11-04T23:00:00.000Z'), at('2026-11-05T00:00:00.000Z')] as const, // 10:00–11:00
  // plan starts
  startA: at('2026-11-04T21:00:00.000Z'), // 08:00
  startB: at('2026-11-04T22:00:00.000Z'), // 09:00
  startC: at('2026-11-04T23:25:00.000Z'), // 10:25
};

function stop(
  appointmentId: string,
  sequence: number,
  win: readonly [Date, Date],
  durationMinutes: number,
  travelS: number,
  published: Date | null,
  overrides: Partial<EtaPlanStop> = {},
): EtaPlanStop {
  return {
    appointmentId,
    sequence,
    tenantId: 'ag-syd',
    scheduledDate: DATE,
    appointmentStatus: 'SCHEDULED',
    travelS,
    durationMinutes,
    windowStartAt: win[0],
    windowEndAt: win[1],
    windowTimezone: TZ,
    missingCoordinates: false,
    serviceStartAt: null,
    serviceEndAt: null,
    publishedServiceStartAt: published,
    ...overrides,
  };
}

function plan(overrides: Partial<EtaPlanInput> = {}): EtaPlanInput {
  return {
    dayPlanId: 'dp-1',
    planVersion: 1,
    planDate: DATE,
    timezone: TZ,
    hasOrigin: true,
    departureAt: L.dep0740,
    approximate: false,
    stops: [
      stop('A', 1, L.winA, 45, 1200, L.startA),
      stop('B', 2, L.winB, 60, 900, L.startB),
      stop('C', 3, L.winC, 45, 1500, L.startC),
    ],
    ...overrides,
  };
}

const noEvents = (): EtaRealEvents => ({ executions: new Map(), lateNotices: new Map() });

const byId = (stops: ReturnType<typeof projectStopEta>) =>
  new Map(stops.map((s) => [s.appointmentId, s]));

describe('projectStopEta', () => {
  it('E1 — morning, no events (07:00): A 08:00, B 09:00, C 10:25, all PENDING, lateS 0', () => {
    const out = byId(projectStopEta(plan(), noEvents(), at('2026-11-04T20:00:00.000Z')));
    expect(out.get('A')!.state).toBe('PENDING');
    expect(out.get('A')!.projectedStartAt!.toISOString()).toBe(L.startA.toISOString());
    expect(out.get('B')!.projectedStartAt!.toISOString()).toBe(L.startB.toISOString());
    expect(out.get('C')!.projectedStartAt!.toISOString()).toBe(L.startC.toISOString());
    expect(out.get('A')!.lateS).toBe(0);
    expect(out.get('B')!.lateS).toBe(0);
    expect(out.get('C')!.lateS).toBe(0);
  });

  it('E1b — inspector late to leave (08:10, no check-in): departure max(07:40,08:10)=08:10', () => {
    const out = byId(projectStopEta(plan(), noEvents(), at('2026-11-04T21:10:00.000Z')));
    expect(out.get('A')!.projectedStartAt!.toISOString()).toBe('2026-11-04T21:30:00.000Z'); // 08:30
    expect(out.get('B')!.projectedStartAt!.toISOString()).toBe('2026-11-04T22:30:00.000Z'); // 09:30
    expect(out.get('C')!.projectedStartAt!.toISOString()).toBe('2026-11-04T23:55:00.000Z'); // 10:55
    expect(out.get('C')!.lateS).toBe(0);
  });

  it('E2 — A finished 08:55 (evaluated 08:55:20): anchor 08:55:20', () => {
    const events: EtaRealEvents = {
      executions: new Map([['A', { startedAt: at('2026-11-04T21:00:00.000Z'), finishedAt: at('2026-11-04T21:55:00.000Z') }]]),
      lateNotices: new Map(),
    };
    const out = byId(projectStopEta(plan(), events, at('2026-11-04T21:55:20.000Z')));
    expect(out.get('A')!.state).toBe('DONE');
    expect(out.get('A')!.projectedEndAt!.toISOString()).toBe('2026-11-04T21:55:00.000Z');
    expect(out.get('B')!.projectedStartAt!.toISOString()).toBe('2026-11-04T22:10:20.000Z'); // 09:10:20
    expect(out.get('C')!.projectedStartAt!.toISOString()).toBe('2026-11-04T23:35:20.000Z'); // 10:35:20
    expect(out.get('C')!.lateS).toBe(0);
  });

  it('E3a — B in progress (check-in 09:12), sweep 10:30: C 10:55, not late (20)', () => {
    const events: EtaRealEvents = {
      executions: new Map([
        ['A', { startedAt: at('2026-11-04T21:00:00.000Z'), finishedAt: at('2026-11-04T21:55:00.000Z') }],
        ['B', { startedAt: at('2026-11-04T22:12:00.000Z'), finishedAt: null }],
      ]),
      lateNotices: new Map(),
    };
    const out = byId(projectStopEta(plan(), events, at('2026-11-04T23:30:00.000Z')));
    expect(out.get('B')!.state).toBe('IN_PROGRESS');
    // anchor = max(10:30, 09:12 + 60m = 10:12) = 10:30 → C arrival 10:55
    expect(out.get('C')!.projectedStartAt!.toISOString()).toBe('2026-11-04T23:55:00.000Z');
    expect(out.get('C')!.lateS).toBe(0);
    expect(isProjectedLate(out.get('C')!, 20)).toBe(false);
  });

  it('E3b — same at 11:00: C 11:25, lateS 1500, late@20 not@25 not@30', () => {
    const events: EtaRealEvents = {
      executions: new Map([
        ['A', { startedAt: at('2026-11-04T21:00:00.000Z'), finishedAt: at('2026-11-04T21:55:00.000Z') }],
        ['B', { startedAt: at('2026-11-04T22:12:00.000Z'), finishedAt: null }],
      ]),
      lateNotices: new Map(),
    };
    const out = byId(projectStopEta(plan(), events, at('2026-11-05T00:00:00.000Z')));
    expect(out.get('C')!.projectedStartAt!.toISOString()).toBe('2026-11-05T00:25:00.000Z'); // 11:25
    expect(out.get('C')!.lateS).toBe(1500);
    expect(isProjectedLate(out.get('C')!, 20)).toBe(true);
    expect(isProjectedLate(out.get('C')!, 25)).toBe(false);
    expect(isProjectedLate(out.get('C')!, 30)).toBe(false);
  });

  it('E4a — LATE_NOTICE 30m on B at 08:20 (A in progress since 08:00): B floor 09:30', () => {
    const events: EtaRealEvents = {
      executions: new Map([['A', { startedAt: at('2026-11-04T21:00:00.000Z'), finishedAt: null }]]),
      lateNotices: new Map([['B', { minutesLate: 30, createdAt: at('2026-11-04T21:20:00.000Z'), clientOccurredAt: null }]]),
    };
    const out = byId(projectStopEta(plan(), events, at('2026-11-04T21:20:00.000Z')));
    expect(out.get('B')!.projectedStartAt!.toISOString()).toBe('2026-11-04T22:30:00.000Z'); // 09:30
    expect(out.get('B')!.floorApplied).toBe(true);
    expect(out.get('C')!.projectedStartAt!.toISOString()).toBe('2026-11-04T23:55:00.000Z'); // 10:55
    expect(out.get('A')!.floorApplied).toBe(false);
    expect(out.get('C')!.lateS).toBe(0);
  });

  it('E4b — LATE_NOTICE 60m on B at 08:20: B floor 10:00, C 11:25 late, B not late', () => {
    const events: EtaRealEvents = {
      executions: new Map([['A', { startedAt: at('2026-11-04T21:00:00.000Z'), finishedAt: null }]]),
      lateNotices: new Map([['B', { minutesLate: 60, createdAt: at('2026-11-04T21:20:00.000Z'), clientOccurredAt: null }]]),
    };
    const out = byId(projectStopEta(plan(), events, at('2026-11-04T21:20:00.000Z')));
    expect(out.get('B')!.projectedStartAt!.toISOString()).toBe('2026-11-04T23:00:00.000Z'); // 10:00
    expect(out.get('C')!.projectedStartAt!.toISOString()).toBe('2026-11-05T00:25:00.000Z'); // 11:25
    expect(out.get('C')!.lateS).toBe(1500);
    expect(out.get('B')!.lateS).toBe(0);
  });

  it('E4c — LATE_NOTICE on a started stop is ignored (the real event wins)', () => {
    const events: EtaRealEvents = {
      executions: new Map([['B', { startedAt: at('2026-11-04T22:00:00.000Z'), finishedAt: null }]]),
      lateNotices: new Map([['B', { minutesLate: 60, createdAt: at('2026-11-04T21:20:00.000Z'), clientOccurredAt: null }]]),
    };
    const out = byId(projectStopEta(plan(), events, at('2026-11-04T22:30:00.000Z')));
    expect(out.get('B')!.state).toBe('IN_PROGRESS');
    expect(out.get('B')!.floorApplied).toBe(false);
  });

  it('E5 — no origin (NONE, departure null) at 07:00: A at window 08:00', () => {
    const p = plan({ hasOrigin: false, departureAt: null });
    const out = byId(projectStopEta(p, noEvents(), at('2026-11-04T20:00:00.000Z')));
    expect(out.get('A')!.projectedStartAt!.toISOString()).toBe(L.startA.toISOString()); // 08:00
    expect(out.get('B')!.projectedStartAt!.toISOString()).toBe(L.startB.toISOString()); // 09:00
    expect(out.get('C')!.projectedStartAt!.toISOString()).toBe(L.startC.toISOString()); // 10:25
  });

  it('E5b — no origin at 08:30, no check-in: A starts max(now, window)=08:30', () => {
    const p = plan({ hasOrigin: false, departureAt: null });
    const out = byId(projectStopEta(p, noEvents(), at('2026-11-04T21:30:00.000Z')));
    expect(out.get('A')!.projectedStartAt!.toISOString()).toBe('2026-11-04T21:30:00.000Z'); // 08:30
    expect(out.get('B')!.projectedStartAt!.toISOString()).toBe('2026-11-04T22:30:00.000Z'); // 09:30 (08:30+45+15)
    expect(out.get('C')!.projectedStartAt!.toISOString()).toBe('2026-11-04T23:55:00.000Z'); // 10:55
  });

  it('E6 — missing-coordinate stop consumes only service time; next leg measured from last point', () => {
    const p = plan({
      stops: [
        stop('A', 1, L.winA, 45, 1200, L.startA),
        stop('B', 2, L.winB, 60, 0, L.startB, { missingCoordinates: true }),
        stop('C', 3, L.winC, 45, 1500, L.startC), // travel measured A→C (900+1500 wouldn't apply: leg kept as stored)
      ],
    });
    const out = byId(projectStopEta(p, noEvents(), at('2026-11-04T20:00:00.000Z')));
    // A 08:00–08:45; B no travel → arrives 08:45, window pushes start to 09:00, end 10:00; C leg 1500 → 10:25
    expect(out.get('B')!.projectedStartAt!.toISOString()).toBe('2026-11-04T22:00:00.000Z');
    expect(out.get('C')!.projectedStartAt!.toISOString()).toBe(L.startC.toISOString());
  });

  it('E7 — DONE without execution (OP-marked): anchor = min(serviceEnd, now)', () => {
    const p = plan({
      stops: [
        stop('A', 1, L.winA, 45, 1200, L.startA, { appointmentStatus: 'DONE', serviceEndAt: at('2026-11-04T21:45:00.000Z') }),
        stop('B', 2, L.winB, 60, 900, L.startB),
        stop('C', 3, L.winC, 45, 1500, L.startC),
      ],
    });
    // now 09:30: anchor = min(08:45, 09:30) = 08:45, but departure >= now, so B
    // departs 09:30 and arrives 09:45 (the inspector cannot leave in the past).
    const late = byId(projectStopEta(p, noEvents(), at('2026-11-04T22:30:00.000Z')));
    expect(late.get('A')!.state).toBe('DONE');
    expect(late.get('B')!.projectedStartAt!.toISOString()).toBe('2026-11-04T22:45:00.000Z'); // 09:45
    // now 08:20: anchor = min(08:45, 08:20) = 08:20 (never a future anchor), so
    // B departs 08:20, arrives 08:35, window pushes start to 09:00.
    const early = byId(projectStopEta(p, noEvents(), at('2026-11-04T21:20:00.000Z')));
    expect(early.get('B')!.projectedStartAt!.toISOString()).toBe('2026-11-04T22:00:00.000Z'); // 09:00
  });

  it('E8 — abandoned execution (both null) is treated as PENDING', () => {
    const events: EtaRealEvents = {
      executions: new Map([['A', { startedAt: null, finishedAt: null }]]),
      lateNotices: new Map(),
    };
    const out = byId(projectStopEta(plan(), events, at('2026-11-04T20:00:00.000Z')));
    expect(out.get('A')!.state).toBe('PENDING');
  });

  it('E9 — defensive out-of-order prefix: executed first, pending by sequence', () => {
    const p = plan({
      stops: [
        stop('B', 1, L.winB, 60, 900, L.startB), // pending, lower sequence
        stop('A', 2, L.winA, 45, 1200, L.startA, { appointmentStatus: 'DONE' }),
      ],
    });
    const events: EtaRealEvents = {
      executions: new Map([['A', { startedAt: at('2026-11-04T21:00:00.000Z'), finishedAt: at('2026-11-04T21:45:00.000Z') }]]),
      lateNotices: new Map(),
    };
    const out = projectStopEta(p, events, at('2026-11-04T21:50:00.000Z'));
    // output sorted by sequence: B(1), A(2)
    expect(out.map((s) => s.appointmentId)).toEqual(['B', 'A']);
    expect(out[1]!.state).toBe('DONE');
  });

  it('E10 — a CANCELLED/REJECTED stop is excluded from the projection', () => {
    const p = plan({
      stops: [
        stop('A', 1, L.winA, 45, 1200, L.startA),
        stop('B', 2, L.winB, 60, 900, L.startB, { appointmentStatus: 'REJECTED' }),
        stop('C', 3, L.winC, 45, 1500, L.startC),
      ],
    });
    const out = projectStopEta(p, noEvents(), at('2026-11-04T20:00:00.000Z'));
    expect(out.map((s) => s.appointmentId)).toEqual(['A', 'C']);
  });

  it('E11 — empty plan → []; all DONE → only DONE, no PENDING', () => {
    expect(projectStopEta(plan({ stops: [] }), noEvents(), at('2026-11-04T20:00:00.000Z'))).toEqual([]);
    const p = plan({
      stops: [stop('A', 1, L.winA, 45, 1200, L.startA, { appointmentStatus: 'DONE' })],
    });
    const events: EtaRealEvents = {
      executions: new Map([['A', { startedAt: at('2026-11-04T21:00:00.000Z'), finishedAt: at('2026-11-04T21:45:00.000Z') }]]),
      lateNotices: new Map(),
    };
    const out = projectStopEta(p, events, at('2026-11-04T22:00:00.000Z'));
    expect(out.every((s) => s.state === 'DONE')).toBe(true);
  });

  it('E12 — coherence: no LATE_NOTICE reproduces the stored plan starts and a direct evaluateSequence', () => {
    // (a) now <= departure → equals stored service_start_at
    const p = plan({
      stops: [
        stop('A', 1, L.winA, 45, 1200, L.startA, { serviceStartAt: L.startA }),
        stop('B', 2, L.winB, 60, 900, L.startB, { serviceStartAt: L.startB }),
        stop('C', 3, L.winC, 45, 1500, L.startC, { serviceStartAt: L.startC }),
      ],
    });
    const out = byId(projectStopEta(p, noEvents(), at('2026-11-04T20:00:00.000Z')));
    for (const s of p.stops) {
      expect(out.get(s.appointmentId)!.projectedStartAt!.toISOString()).toBe(s.serviceStartAt!.toISOString());
    }
    // (b) later now → equals a direct evaluateSequence with earliestDepartureS = max(departure, now)
    const now = at('2026-11-04T21:10:00.000Z');
    const depS = Math.floor(Math.max(L.dep0740.getTime(), now.getTime()) / 1000);
    const w = (d: Date) => Math.floor(d.getTime() / 1000);
    const input: OptimizerInput = {
      stops: [
        { key: 'A', windowStartS: w(L.winA[0]), windowEndS: w(L.winA[1]), serviceS: 45 * 60, matrixIndex: 1 },
        { key: 'B', windowStartS: w(L.winB[0]), windowEndS: w(L.winB[1]), serviceS: 60 * 60, matrixIndex: 2 },
        { key: 'C', windowStartS: w(L.winC[0]), windowEndS: w(L.winC[1]), serviceS: 45 * 60, matrixIndex: 3 },
      ],
      travelS: Array.from({ length: 4 }, () => [0, 0, 0, 0]),
      originIndex: 0,
      earliestDepartureS: depS,
      weights: DEFAULT_ROUTE_WEIGHTS,
    };
    const ev = evaluateSequence(input, ['A', 'B', 'C'], { legTravelS: [1200, 900, 1500] });
    const out2 = byId(projectStopEta(p, noEvents(), now));
    for (const es of ev.stops) {
      expect(out2.get(es.key)!.projectedStartAt!.getTime() / 1000).toBe(es.serviceStartS);
    }
  });

  it('E12b — etaPlanInputFromDayPlanResponse maps stops and leaves publishedServiceStartAt null', () => {
    const resp = {
      id: 'dp-1',
      version: 2,
      date: DATE,
      timezone: TZ,
      approximate: true,
      origin: { source: 'BASE' as const },
      departureAt: L.dep0740.toISOString(),
      stops: [
        {
          appointmentId: 'A',
          sequence: 1,
          appointmentStatus: 'SCHEDULED' as const,
          travelS: 1200,
          durationMinutes: 45,
          windowStartAt: L.winA[0].toISOString(),
          windowEndAt: L.winA[1].toISOString(),
          timezone: TZ,
          missingCoordinates: false,
          serviceStartAt: L.startA.toISOString(),
          serviceEndAt: null,
        },
      ],
    };
    // Only the fields the adapter reads are asserted; the cast keeps the test
    // independent of the full DayPlanResponse shape.
    const input = etaPlanInputFromDayPlanResponse(resp as never);
    expect(input.dayPlanId).toBe('dp-1');
    expect(input.planVersion).toBe(2);
    expect(input.hasOrigin).toBe(true);
    expect(input.approximate).toBe(true);
    expect(input.stops[0]!.travelS).toBe(1200);
    expect(input.stops[0]!.windowTimezone).toBe(TZ);
    expect(input.stops[0]!.publishedServiceStartAt).toBeNull();
    expect(input.stops[0]!.serviceStartAt!.toISOString()).toBe(L.startA.toISOString());
  });

  it('E13 — DST: start of Sydney DST 2026-10-04, 07:00 → A 08:00 (epoch arithmetic only)', () => {
    const winA = [at('2026-10-03T21:00:00.000Z'), at('2026-10-03T23:00:00.000Z')] as const; // 08:00–10:00 AEST→AEDT
    const p: EtaPlanInput = {
      dayPlanId: 'dp-dst',
      planVersion: 1,
      planDate: '2026-10-04',
      timezone: TZ,
      hasOrigin: false,
      departureAt: null,
      approximate: false,
      stops: [stop('A', 1, winA, 45, 0, winA[0])],
    };
    const out = byId(projectStopEta(p, noEvents(), at('2026-10-03T20:00:00.000Z'))); // 07:00
    expect(out.get('A')!.projectedStartAt!.toISOString()).toBe('2026-10-03T21:00:00.000Z');
  });

  it('E14 — determinism: same input → equal output; shuffled stops → same ordered output', () => {
    const a = projectStopEta(plan(), noEvents(), at('2026-11-04T20:00:00.000Z'));
    const b = projectStopEta(plan(), noEvents(), at('2026-11-04T20:00:00.000Z'));
    expect(a).toEqual(b);
    const shuffled = plan({ stops: [plan().stops[2]!, plan().stops[0]!, plan().stops[1]!] });
    const c = projectStopEta(shuffled, noEvents(), at('2026-11-04T20:00:00.000Z'));
    expect(c.map((s) => s.appointmentId)).toEqual(['A', 'B', 'C']);
  });
});
