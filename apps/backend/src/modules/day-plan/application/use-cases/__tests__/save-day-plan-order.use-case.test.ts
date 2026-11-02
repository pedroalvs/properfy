import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetricsCollector } from '../../../../../shared/infrastructure/metrics';
import { StubRoutingService } from '../../../infrastructure/routing/stub-routing.service';
import { PlanRouteService } from '../../services/plan-route.service';
import { ComputeDayPlanUseCase } from '../compute-day-plan.use-case';
import { GetMyDayPlanUseCase } from '../get-my-day-plan.use-case';
import { SaveDayPlanOrderUseCase } from '../save-day-plan-order.use-case';
import type { IDayPlanRepository, SaveDayPlanInput } from '../../../domain/day-plan.repository';
import type { DayPlanRecord, DayPlanStopRecord } from '../../../domain/day-plan.entity';
import type { DayPlanCandidate, IDayPlanInputReader, InspectorDayPlanContext } from '../../../domain/day-plan-input.reader';

function logger(): any { const l: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }; l.child = () => l; return l; }

const INSPECTOR_ID = '11111111-1111-1111-1111-111111111111';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DATE = '2026-11-05';
const NOW = new Date('2026-11-04T09:00:00.000Z');

function candidate(id: string, lng: number): DayPlanCandidate {
  return {
    appointmentId: id, appointmentCode: 'INS-0001', appointmentStatus: 'SCHEDULED', agencyName: 'RW',
    tenantTimezone: 'Australia/Sydney', scheduledDate: DATE, timeSlotStart: '08:00', timeSlotEnd: '17:00',
    windowStartAt: new Date('2026-11-04T21:00:00Z'), windowEndAt: new Date('2026-11-05T06:00:00Z'),
    durationMinutes: 45, serviceTypeName: 'Routine', lat: -33.88, lng, propertyAddress: 'x', suburb: 'Surry Hills',
    keyRequired: false, meetingLocation: null, rentalTenantConfirmationStatus: 'CONFIRMED', contacts: [],
    startedAt: null, finishedAt: null, abandonedAt: null,
  };
}

class FakeReader implements IDayPlanInputReader {
  candidates: DayPlanCandidate[] = [candidate(A, 151.1), candidate(B, 151.2)];
  async loadCandidates(): Promise<DayPlanCandidate[]> { return this.candidates.map((c) => ({ ...c })); }
  async loadAppointmentPlanKey() { return null; }
  async loadInspectorContext(): Promise<InspectorDayPlanContext | null> {
    return { inspectorId: INSPECTOR_ID, name: 'Jane', timezone: 'Australia/Sydney', active: true, baseLat: -33.87, baseLng: 151.2, baseAddress: null, baseGeocodeFailed: false };
  }
}

class InMemoryRepo implements IDayPlanRepository {
  private store = new Map<string, DayPlanRecord>();
  private key(i: string, d: string) { return `${i}:${d}`; }
  async findByInspectorAndDate(i: string, d: string) { return this.store.get(this.key(i, d)) ?? null; }
  async saveComputed(input: SaveDayPlanInput) {
    const key = this.key(input.inspectorId, input.planDate);
    const current = this.store.get(key);
    if (input.expectedVersion === null) { if (current) return null; const r = this.rec(input, crypto.randomUUID(), 1); this.store.set(key, r); return r; }
    if (!current || current.version !== input.expectedVersion) return null;
    const r = this.rec(input, current.id, current.version + 1); this.store.set(key, r); return r;
  }
  async clearStale() { return null; }
  async markStaleByAppointmentIds() { return 0; }
  async markStaleByInspector() { return 0; }
  async markNotified() {}
  async purgePastRouteData() { return 0; }
  async getEtaAccuracySamples() { return []; }
  private rec(input: SaveDayPlanInput, id: string, version: number): DayPlanRecord {
    const stops: DayPlanStopRecord[] = input.stops.map((s) => ({
      id: crypto.randomUUID(), appointmentId: s.appointmentId, sequence: s.sequence, eta: s.eta, serviceStartAt: s.serviceStartAt,
      serviceEndAt: s.serviceEndAt, publishedEta: s.publishedEta, publishedServiceStartAt: s.publishedServiceStartAt,
      publishedPredictedAt: s.publishedPredictedAt, publishedApproximate: s.publishedApproximate, travelS: s.travelS,
      distanceM: s.distanceM, waitS: s.waitS, lateS: s.lateS, windowStartAt: s.windowStartAt, windowEndAt: s.windowEndAt,
      windowTimezone: s.windowTimezone, durationMinutes: s.durationMinutes, lat: s.lat, lng: s.lng, manual: s.manual,
      executed: s.executed, approximate: s.approximate, missingCoordinates: s.missingCoordinates,
    }));
    return { ...(input as unknown as DayPlanRecord), id, version, staleAt: null, staleReason: null, geometryPurgedAt: null, stops };
  }
}

const settings = { get: vi.fn(async () => ({ travel: 1, windowWait: 1, baseProximity: 1 })) };
const clock = { now: () => NOW };
const audit = { log: vi.fn() };

function wire(reader: FakeReader, repo: InMemoryRepo) {
  const stub = new StubRoutingService();
  const planRoute = new PlanRouteService(stub, stub, logger(), new MetricsCollector());
  const compute = new ComputeDayPlanUseCase(reader, repo, planRoute, settings as never, logger(), clock);
  const getMy = new GetMyDayPlanUseCase(reader, repo, compute, clock);
  const save = new SaveDayPlanOrderUseCase(reader, repo, compute, audit as never, clock);
  return { getMy, save };
}

describe('SaveDayPlanOrderUseCase', () => {
  let reader: FakeReader; let repo: InMemoryRepo;
  beforeEach(() => { reader = new FakeReader(); repo = new InMemoryRepo(); audit.log.mockClear(); });

  it('saves a manual order and audits it', async () => {
    const { getMy, save } = wire(reader, repo);
    const plan = await getMy.execute({ inspectorId: INSPECTOR_ID, date: DATE });
    const order = [...plan.suggestedOrder].reverse();
    const res = await save.execute({ inspectorId: INSPECTOR_ID, actorUserId: 'u1', date: DATE, appointmentIds: order, basedOnVersion: plan.version });
    expect(res.manualOrder).toBe(true);
    expect(res.stops.map((s) => s.appointmentId)).toEqual(order);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'day_plan.reordered', entityType: 'DayPlan' }));
  });

  it('409s on a stale basedOnVersion', async () => {
    const { getMy, save } = wire(reader, repo);
    const plan = await getMy.execute({ inspectorId: INSPECTOR_ID, date: DATE });
    await expect(
      save.execute({ inspectorId: INSPECTOR_ID, actorUserId: 'u1', date: DATE, appointmentIds: [...plan.suggestedOrder].reverse(), basedOnVersion: plan.version + 5 }),
    ).rejects.toMatchObject({ code: 'DAY_PLAN_VERSION_CONFLICT', details: { currentVersion: plan.version } });
  });

  it('422s on an id set that does not match the reorderable stops', async () => {
    const { getMy, save } = wire(reader, repo);
    const plan = await getMy.execute({ inspectorId: INSPECTOR_ID, date: DATE });
    await expect(
      save.execute({ inspectorId: INSPECTOR_ID, actorUserId: 'u1', date: DATE, appointmentIds: [plan.suggestedOrder[0]!], basedOnVersion: plan.version }),
    ).rejects.toMatchObject({ code: 'DAY_PLAN_ORDER_MISMATCH' });
  });

  it('422s on a past date', async () => {
    const { save } = wire(reader, repo);
    await expect(
      save.execute({ inspectorId: INSPECTOR_ID, actorUserId: 'u1', date: '2020-01-01', appointmentIds: [A, B], basedOnVersion: 1 }),
    ).rejects.toMatchObject({ code: 'DAY_PLAN_DATE_IN_PAST' });
  });
});
