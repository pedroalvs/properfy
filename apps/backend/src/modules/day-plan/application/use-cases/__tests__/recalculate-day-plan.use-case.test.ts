import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { MetricsCollector } from '../../../../../shared/infrastructure/metrics';
import { StubRoutingService } from '../../../infrastructure/routing/stub-routing.service';
import { PlanRouteService } from '../../services/plan-route.service';
import { ComputeDayPlanUseCase } from '../compute-day-plan.use-case';
import { GetMyDayPlanUseCase } from '../get-my-day-plan.use-case';
import { RecalculateDayPlanUseCase, hasEffectiveChange } from '../recalculate-day-plan.use-case';
import type { DayPlanRecord, DayPlanStopRecord } from '../../../domain/day-plan.entity';
import type { IDayPlanRepository, SaveDayPlanInput } from '../../../domain/day-plan.repository';
import type { DayPlanCandidate, IDayPlanInputReader, InspectorDayPlanContext } from '../../../domain/day-plan-input.reader';

function logger(): any { const l: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }; l.child = () => l; return l; }

const I = '11111111-1111-1111-1111-111111111111';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DATE = '2026-11-05';
const NOW = new Date('2026-11-04T09:00:00.000Z');

function stop(id: string, sequence: number, startMs: number, executed = false): DayPlanStopRecord {
  const d = new Date(startMs);
  return {
    id: `s-${id}`, appointmentId: id, sequence, eta: d, serviceStartAt: d, serviceEndAt: d, publishedEta: d,
    publishedServiceStartAt: d, publishedPredictedAt: d, publishedApproximate: false, travelS: 0, distanceM: null,
    waitS: 0, lateS: 0, windowStartAt: d, windowEndAt: d, windowTimezone: 'Australia/Sydney', durationMinutes: 45,
    lat: -33.8, lng: 151.1, manual: false, executed, approximate: false, missingCoordinates: false,
  };
}
function rec(stops: DayPlanStopRecord[]): DayPlanRecord {
  return { id: 'p', inspectorId: I, planDate: DATE, timezone: 'Australia/Sydney', status: 'PUBLISHED', version: 1,
    inputFingerprint: 'f', publishedAt: NOW, notifiedAt: null, computedAt: NOW, computedByUserId: null,
    lastTrigger: 'SCHEDULED_PUBLISH', staleAt: null, staleReason: null, originSource: 'BASE', originLat: -33.87,
    originLng: 151.2, originOverride: null, originOverrideLat: null, originOverrideLng: null, originOverrideSetAt: null,
    departureAt: NOW, finishEta: NOW, totalDriveS: 0, totalWaitS: 0, totalServiceS: 0, totalLateS: 0, totalDistanceM: null,
    feasible: true, manualOrder: false, suggestedOrder: stops.map((s) => s.appointmentId), weights: { travel: 1, windowWait: 1, baseProximity: 1 },
    optimizerMethod: 'EXACT', routingProvider: 'STUB', matrixProfile: 'haversine', approximate: false, approximateReason: null,
    routeGeometry: null, routingMatrix: null, legTravel: null, geometryPurgedAt: null, stops };
}

describe('hasEffectiveChange', () => {
  it('is true when the reorderable order changes', () => {
    const prev = rec([stop(A, 1, 1000), stop(B, 2, 2000)]);
    const next = rec([stop(B, 1, 1000), stop(A, 2, 2000)]);
    expect(hasEffectiveChange(prev, next)).toBe(true);
  });
  it('is true when a serviceStartAt moves more than 5 minutes', () => {
    const prev = rec([stop(A, 1, 1_000_000)]);
    const next = rec([stop(A, 1, 1_000_000 + 6 * 60_000)]);
    expect(hasEffectiveChange(prev, next)).toBe(true);
  });
  it('is false when nothing moves more than 5 minutes', () => {
    const prev = rec([stop(A, 1, 1_000_000), stop(B, 2, 2_000_000)]);
    const next = rec([stop(A, 1, 1_000_000 + 60_000), stop(B, 2, 2_000_000 + 60_000)]);
    expect(hasEffectiveChange(prev, next)).toBe(false);
  });
});

// --- integration (notify-on-change) ---
function candidate(id: string, lng: number): DayPlanCandidate {
  return { appointmentId: id, appointmentCode: 'INS-0001', appointmentStatus: 'SCHEDULED', agencyName: 'RW',
    tenantTimezone: 'Australia/Sydney', scheduledDate: DATE, timeSlotStart: '08:00', timeSlotEnd: '17:00',
    windowStartAt: new Date('2026-11-04T21:00:00Z'), windowEndAt: new Date('2026-11-05T06:00:00Z'), durationMinutes: 45,
    serviceTypeName: 'Routine', lat: -33.88, lng, propertyAddress: 'x', suburb: 'Surry Hills', keyRequired: false,
    meetingLocation: null, rentalTenantConfirmationStatus: 'CONFIRMED', contacts: [], startedAt: null, finishedAt: null, abandonedAt: null };
}
class FakeReader implements IDayPlanInputReader {
  candidates = [candidate(A, 151.1), candidate(B, 151.9)];
  async loadCandidates() { return this.candidates.map((c) => ({ ...c })); }
  async loadAppointmentPlanKey() { return null; }
  async loadInspectorContext(): Promise<InspectorDayPlanContext | null> {
    return { inspectorId: I, name: 'Jane', timezone: 'Australia/Sydney', active: true, baseLat: -33.87, baseLng: 151.2, baseAddress: null, baseGeocodeFailed: false };
  }
}
class Repo implements IDayPlanRepository {
  m = new Map<string, DayPlanRecord>();
  k(i: string, d: string) { return `${i}:${d}`; }
  async findByInspectorAndDate(i: string, d: string) { return this.m.get(this.k(i, d)) ?? null; }
  async saveComputed(input: SaveDayPlanInput) {
    const key = this.k(input.inspectorId, input.planDate); const cur = this.m.get(key);
    if (input.expectedVersion === null) { if (cur) return null; const r = this.toRec(input, 'p', 1); this.m.set(key, r); return r; }
    if (!cur || cur.version !== input.expectedVersion) return null; const r = this.toRec(input, cur.id, cur.version + 1); this.m.set(key, r); return r;
  }
  async clearStale() { return null; } async markStaleByAppointmentIds() { return 0; } async markStaleByInspector() { return 0; }
  async markNotified() {} async purgePastRouteData() { return 0; } async getEtaAccuracySamples() { return []; }
  private toRec(input: SaveDayPlanInput, id: string, version: number): DayPlanRecord {
    return { ...(input as unknown as DayPlanRecord), id, version, staleAt: null, staleReason: null, geometryPurgedAt: null,
      stops: input.stops.map((s, i) => ({ ...(s as unknown as DayPlanStopRecord), id: `s${i}` })) };
  }
}
const settings = { get: vi.fn(async () => ({ travel: 1, windowWait: 1, baseProximity: 1 })) };
const clock = { now: () => NOW };
const audit = { log: vi.fn() };
const AM: AuthContext = { userId: 'op', tenantId: null, role: 'OP', inspectorId: null } as AuthContext;
const INSP: AuthContext = { userId: 'u', tenantId: null, role: 'INSP', inspectorId: I } as AuthContext;
const authz = { assertRoles: () => {} };

function wire(reader: FakeReader, repo: Repo) {
  const stubR = new StubRoutingService();
  const planRoute = new PlanRouteService(stubR, stubR, logger(), new MetricsCollector());
  const compute = new ComputeDayPlanUseCase(reader, repo, planRoute, settings as never, logger(), clock);
  const getMy = new GetMyDayPlanUseCase(reader, repo, compute, clock);
  const notices = { execute: vi.fn(async () => ({ created: true })) };
  const recalc = new RecalculateDayPlanUseCase(reader, repo, compute, authz as never, notices as never, audit as never, clock);
  return { getMy, recalc, notices };
}

describe('RecalculateDayPlanUseCase', () => {
  let reader: FakeReader; let repo: Repo;
  beforeEach(() => { reader = new FakeReader(); repo = new Repo(); audit.log.mockClear(); });

  it('OP recalc of a published plan notifies ROUTE_CHANGED when the route changes', async () => {
    const { getMy, recalc, notices } = wire(reader, repo);
    await getMy.execute({ inspectorId: I, date: DATE });
    // Change a stop's coordinate so the recompute yields different times/order.
    reader.candidates[1] = candidate(B, 151.05);
    await recalc.execute({ actor: AM, inspectorId: I, date: DATE });
    expect(notices.execute).toHaveBeenCalledWith(expect.objectContaining({ type: 'ROUTE_CHANGED', inspectorIds: [I] }));
  });

  it('forbids an inspector recalculating another inspector (IDOR guard)', async () => {
    const { recalc } = wire(reader, repo);
    const other = '99999999-9999-9999-9999-999999999999';
    await expect(
      recalc.execute({ actor: INSP, inspectorId: other, date: DATE }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('inspector recalc never notifies', async () => {
    const { getMy, recalc, notices } = wire(reader, repo);
    await getMy.execute({ inspectorId: I, date: DATE });
    await recalc.execute({ actor: INSP, inspectorId: I, date: DATE });
    expect(notices.execute).not.toHaveBeenCalled();
  });
});
