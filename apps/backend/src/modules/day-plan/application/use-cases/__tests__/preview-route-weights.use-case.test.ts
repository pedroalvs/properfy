/**
 * Unit coverage for PreviewRouteWeightsUseCase (contract 01.14, L-F04-14).
 * Exercises the real PlanRouteService with a fake routing provider so the
 * "1 Matrix call / 0 Directions" guarantee and the matrix-based ordering are
 * asserted end-to-end. The reader, platform settings and audit are stubbed.
 *
 * TZ is pinned away from Sydney (set below) to prove the date-range guard uses
 * the actor's effective timezone, not the process timezone.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { AuthorizationService } from '../../../../../shared/domain/authorization.service';
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../../../../shared/domain/errors';
import { MetricsCollector } from '../../../../../shared/infrastructure/metrics';
import {
  type IRoutingService,
  type RoutingLeg,
  type RoutingMatrix,
} from '../../../domain/routing.service';
import { StubRoutingService } from '../../../infrastructure/routing/stub-routing.service';
import { PlanRouteService } from '../../services/plan-route.service';
import type { DayPlanCandidate, InspectorDayPlanContext } from '../../../domain/day-plan-input.reader';
import { PreviewRouteWeightsUseCase } from '../preview-route-weights.use-case';

const ORIGINAL_TZ = process.env['TZ'];
beforeAll(() => { process.env['TZ'] = 'America/Sao_Paulo'; });
afterAll(() => { process.env['TZ'] = ORIGINAL_TZ; });

function logger() {
  const l: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  l.child = () => l;
  return l;
}

// Example 6 (TASK-F04-1): points [O, A, B, C].
// O-A 600, O-B 1200, O-C 2400, A-B 600, A-C 1800, B-C 1800 (symmetric).
const EXAMPLE6_MATRIX = [
  [0, 600, 1200, 2400],
  [600, 0, 600, 1800],
  [1200, 600, 0, 1800],
  [2400, 1800, 1800, 0],
];

class FakeRouting implements IRoutingService {
  matrixCalls = 0;
  directionsCalls = 0;
  async matrix(): Promise<RoutingMatrix> {
    this.matrixCalls += 1;
    return {
      provider: 'MAPBOX',
      profile: 'driving-traffic',
      durationsS: EXAMPLE6_MATRIX.map((r) => [...r]),
      distancesM: EXAMPLE6_MATRIX.map((r) => [...r]),
      nullPairs: [],
    };
  }
  async directions(): Promise<RoutingLeg> {
    this.directionsCalls += 1;
    throw new Error('preview must never call directions');
  }
}

const O = { lat: -33.8, lng: 151.0 };
const A = { lat: -33.8, lng: 151.1 };
const B = { lat: -33.8, lng: 151.2 };
const C = { lat: -33.8, lng: 151.3 };

// 08:00 Sydney (AEDT, UTC+11) on 2026-11-05 == 2026-11-04T21:00:00Z.
const W_A: [string, string] = ['2026-11-04T21:00:00Z', '2026-11-04T21:30:00Z']; // 08:00-08:30
const W_B: [string, string] = ['2026-11-04T23:00:00Z', '2026-11-04T23:30:00Z']; // 10:00-10:30
const W_C: [string, string] = ['2026-11-04T21:00:00Z', '2026-11-05T06:00:00Z']; // 08:00-17:00

function candidate(id: string, loc: { lat: number; lng: number }, win: [string, string]): DayPlanCandidate {
  return {
    appointmentId: id,
    appointmentCode: `APPT-${id}`,
    appointmentStatus: 'SCHEDULED',
    agencyName: 'Agency',
    tenantTimezone: 'Australia/Sydney',
    scheduledDate: '2026-11-05',
    timeSlotStart: '08:00',
    timeSlotEnd: id === 'B' ? '10:30' : '17:00',
    windowStartAt: new Date(win[0]),
    windowEndAt: new Date(win[1]),
    durationMinutes: 45,
    serviceTypeName: 'Routine',
    lat: loc.lat,
    lng: loc.lng,
    propertyAddress: `${id} St`,
    suburb: `Suburb-${id}`,
    keyRequired: false,
    meetingLocation: null,
    rentalTenantConfirmationStatus: 'CONFIRMED',
    contacts: [],
    startedAt: null,
    finishedAt: null,
    abandonedAt: null,
  };
}

const INSPECTOR: InspectorDayPlanContext = {
  inspectorId: 'insp-1',
  name: 'Jane Doe',
  timezone: 'Australia/Sydney',
  active: true,
  baseLat: O.lat,
  baseLng: O.lng,
  baseAddress: null,
  baseGeocodeFailed: false,
};

function amActor(): AuthContext {
  return { userId: 'am-u', tenantId: null, role: 'AM', timezone: 'Australia/Sydney' } as AuthContext;
}

function build(opts: {
  inspector?: InspectorDayPlanContext | null;
  candidates?: DayPlanCandidate[];
  savedWeights?: { travel: number; windowWait: number; baseProximity: number };
} = {}) {
  const fake = new FakeRouting();
  const planRoute = new PlanRouteService(fake, new StubRoutingService(), logger(), new MetricsCollector());
  const reader: any = {
    loadInspectorContext: vi.fn().mockResolvedValue(opts.inspector === undefined ? INSPECTOR : opts.inspector),
    loadCandidates: vi.fn().mockResolvedValue(
      opts.candidates ?? [candidate('A', A, W_A), candidate('B', B, W_B), candidate('C', C, W_C)],
    ),
  };
  const settings: any = {
    get: vi.fn().mockResolvedValue(opts.savedWeights ?? { travel: 1, windowWait: 1, baseProximity: 1 }),
  };
  const authorization = new AuthorizationService({ log: vi.fn() } as any);
  const useCase = new PreviewRouteWeightsUseCase(reader, planRoute, settings, authorization, {
    now: () => new Date('2026-11-04T23:00:00Z'),
  } as any);
  return { useCase, fake, reader, settings };
}

describe('PreviewRouteWeightsUseCase', () => {
  it('Example 6: saved {1,1,1} -> current [A,C,B]; proposed {1,0,1} -> [A,B,C] waitS 2100; 1 Matrix, 0 Directions', async () => {
    const { useCase, fake } = build();
    // A future day (not the inspector's today) so earliestDeparture stays null —
    // the canonical Example 6 ordering with forward slack and no clamp.
    const result = await useCase.execute({
      actor: amActor(),
      inspectorId: 'insp-1',
      date: '2026-11-06',
      weights: { travel: 1, windowWait: 0, baseProximity: 1 },
    });

    expect(result.current.stops.map((s) => s.appointmentId)).toEqual(['A', 'C', 'B']);
    expect(result.proposed.stops.map((s) => s.appointmentId)).toEqual(['A', 'B', 'C']);
    expect(result.proposed.totals.waitS).toBe(2100);
    expect(result.current.etaSource).toBe('MATRIX');
    expect(result.proposed.etaSource).toBe('MATRIX');
    // Display fields come from the candidate.
    const first = result.current.stops[0]!;
    expect(first).toMatchObject({ appointmentCode: 'APPT-A', suburb: 'Suburb-A', timezone: 'Australia/Sydney', windowStart: '08:00' });
    expect(typeof first.eta).toBe('string');
    // Contract: exactly one Matrix call shared by both variants, zero Directions.
    expect(fake.matrixCalls).toBe(1);
    expect(fake.directionsCalls).toBe(0);
  });

  it('rejects a CL actor with 403 before any read', async () => {
    const { useCase, reader, fake } = build();
    const cl = { userId: 'cl', tenantId: 't1', role: 'CL_ADMIN', timezone: 'Australia/Sydney' } as AuthContext;
    await expect(
      useCase.execute({ actor: cl, inspectorId: 'insp-1', date: '2026-11-05', weights: { travel: 1, windowWait: 1, baseProximity: 1 } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(reader.loadInspectorContext).not.toHaveBeenCalled();
    expect(fake.matrixCalls).toBe(0);
  });

  it('accepts date == today and today+14 (actor Sydney, now 2026-11-04T23:00:00Z -> 05/11..19/11)', async () => {
    for (const date of ['2026-11-05', '2026-11-19']) {
      const { useCase, fake } = build();
      await expect(
        useCase.execute({ actor: amActor(), inspectorId: 'insp-1', date, weights: { travel: 1, windowWait: 1, baseProximity: 1 } }),
      ).resolves.toBeTruthy();
      expect(fake.matrixCalls).toBe(1);
    }
  });

  it('rejects a date before today or after today+14 with 422 and no routing call (L-F04-14)', async () => {
    for (const date of ['2026-11-04', '2026-11-20']) {
      const { useCase, fake, reader } = build();
      const err = await useCase
        .execute({ actor: amActor(), inspectorId: 'insp-1', date, weights: { travel: 1, windowWait: 1, baseProximity: 1 } })
        .then(() => null)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UnprocessableEntityError);
      expect((err as UnprocessableEntityError).code).toBe('DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE');
      expect(fake.matrixCalls).toBe(0);
      expect(reader.loadCandidates).not.toHaveBeenCalled();
    }
  });

  it('returns 404 INSPECTOR_NOT_FOUND when the inspector does not exist', async () => {
    const { useCase, fake } = build({ inspector: null });
    await expect(
      useCase.execute({ actor: amActor(), inspectorId: 'ghost', date: '2026-11-05', weights: { travel: 1, windowWait: 1, baseProximity: 1 } }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(fake.matrixCalls).toBe(0);
  });

  it('clamps earliest departure to now for a today preview (ETAs never in the past)', async () => {
    // now = 2026-11-05T03:00:00Z == 14:00 Sydney; the inspector's today is 2026-11-05.
    // A's window opened at 08:00 Sydney (21:00Z previous day); without the clamp the
    // optimizer would depart before now and emit past ETAs.
    const fake = new FakeRouting();
    const planRoute = new PlanRouteService(fake, new StubRoutingService(), logger(), new MetricsCollector());
    const reader: any = {
      loadInspectorContext: vi.fn().mockResolvedValue(INSPECTOR),
      loadCandidates: vi.fn().mockResolvedValue([candidate('A', A, W_A), candidate('B', B, W_B), candidate('C', C, W_C)]),
    };
    const settings: any = { get: vi.fn().mockResolvedValue({ travel: 1, windowWait: 1, baseProximity: 1 }) };
    const authorization = new AuthorizationService({ log: vi.fn() } as any);
    const useCase = new PreviewRouteWeightsUseCase(reader, planRoute, settings, authorization, {
      now: () => new Date('2026-11-05T03:00:00Z'),
    } as any);
    const result = await useCase.execute({
      actor: amActor(),
      inspectorId: 'insp-1',
      date: '2026-11-05',
      weights: { travel: 1, windowWait: 1, baseProximity: 1 },
    });
    const nowS = Date.parse('2026-11-05T03:00:00Z');
    expect(result.current.departureAt && Date.parse(result.current.departureAt)).toBeGreaterThanOrEqual(nowS);
    for (const s of result.current.stops) {
      expect(Date.parse(s.eta)).toBeGreaterThanOrEqual(nowS);
    }
    // A future day keeps earliestDeparture null (departure can precede `now`).
    const futureReader: any = {
      loadInspectorContext: vi.fn().mockResolvedValue(INSPECTOR),
      loadCandidates: vi.fn().mockResolvedValue([candidate('A', A, W_A), candidate('B', B, W_B), candidate('C', C, W_C)]),
    };
    const futureUseCase = new PreviewRouteWeightsUseCase(futureReader, new PlanRouteService(new FakeRouting(), new StubRoutingService(), logger(), new MetricsCollector()), settings, authorization, { now: () => new Date('2026-11-05T03:00:00Z') } as any);
    const future = await futureUseCase.execute({ actor: amActor(), inspectorId: 'insp-1', date: '2026-11-06', weights: { travel: 1, windowWait: 1, baseProximity: 1 } });
    expect(future.current.stops.length).toBe(3);
  });

  it('passes the INSPECTOR timezone (not the actor tz) to loadCandidates for T-1 visibility', async () => {
    const { useCase, reader } = build();
    await useCase.execute({ actor: amActor(), inspectorId: 'insp-1', date: '2026-11-05', weights: { travel: 1, windowWait: 1, baseProximity: 1 } });
    // Inspector tz == Sydney; now 2026-11-04T23:00:00Z == 2026-11-05 Sydney.
    expect(reader.loadCandidates).toHaveBeenCalledWith('insp-1', '2026-11-05', '2026-11-05');
  });

  it('uses no origin when the inspector has no geocoded base', async () => {
    const { useCase, fake } = build({
      inspector: { ...INSPECTOR, baseLat: null, baseLng: null },
    });
    const result = await useCase.execute({ actor: amActor(), inspectorId: 'insp-1', date: '2026-11-05', weights: { travel: 1, windowWait: 1, baseProximity: 1 } });
    expect(result.current.stops.length).toBe(3);
    expect(fake.matrixCalls).toBe(1);
  });

  it('degrades to approximate when the provider matrix fails (no throw, 0 Directions)', async () => {
    const fake = new FakeRouting();
    fake.matrix = async () => { throw new Error('provider down'); };
    const planRoute = new PlanRouteService(fake, new StubRoutingService(), logger(), new MetricsCollector());
    const reader: any = {
      loadInspectorContext: vi.fn().mockResolvedValue(INSPECTOR),
      loadCandidates: vi.fn().mockResolvedValue([candidate('A', A, W_A), candidate('B', B, W_B), candidate('C', C, W_C)]),
    };
    const settings: any = { get: vi.fn().mockResolvedValue({ travel: 1, windowWait: 1, baseProximity: 1 }) };
    const useCase = new PreviewRouteWeightsUseCase(reader, planRoute, settings, new AuthorizationService({ log: vi.fn() } as any), { now: () => new Date('2026-11-04T23:00:00Z') } as any);
    const result = await useCase.execute({ actor: amActor(), inspectorId: 'insp-1', date: '2026-11-05', weights: { travel: 1, windowWait: 0, baseProximity: 1 } });
    expect(result.current.approximate).toBe(true);
    expect(result.proposed.approximate).toBe(true);
    expect(fake.directionsCalls).toBe(0);
  });

  // day_plan is platform-scoped (no tenant_id; root CLAUDE.md §7.1). Isolation is
  // purely role-based: only AM/OP may read any inspector's plan. This proves a
  // non-AM/OP actor is denied by the real AuthorizationService before ANY
  // inspector-subject read (no tenant predicate exists to leak through).
  describe('platform-scope isolation (§7.1)', () => {
    for (const role of ['CL_ADMIN', 'CL_USER', 'INSP', 'TNT'] as const) {
      it(`denies ${role} with 403 and never reads the inspector's rows`, async () => {
        const { useCase, reader, settings, fake } = build();
        const actor = { userId: 'u', tenantId: role.startsWith('CL') ? 't1' : null, role, timezone: 'Australia/Sydney' } as AuthContext;
        await expect(
          useCase.execute({ actor, inspectorId: INSPECTOR.inspectorId, date: '2026-11-05', weights: { travel: 1, windowWait: 1, baseProximity: 1 } }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(reader.loadInspectorContext).not.toHaveBeenCalled();
        expect(reader.loadCandidates).not.toHaveBeenCalled();
        expect(settings.get).not.toHaveBeenCalled();
        expect(fake.matrixCalls).toBe(0);
      });
    }
  });
});
