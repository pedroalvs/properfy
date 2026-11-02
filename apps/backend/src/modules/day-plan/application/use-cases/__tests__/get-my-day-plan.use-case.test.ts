import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetricsCollector } from '../../../../../shared/infrastructure/metrics';
import { StubRoutingService } from '../../../infrastructure/routing/stub-routing.service';
import { PlanRouteService } from '../../services/plan-route.service';
import { ComputeDayPlanUseCase } from '../compute-day-plan.use-case';
import { GetMyDayPlanUseCase } from '../get-my-day-plan.use-case';
import type { IDayPlanRepository, SaveDayPlanInput } from '../../../domain/day-plan.repository';
import type { DayPlanRecord, DayPlanStopRecord } from '../../../domain/day-plan.entity';
import type {
  DayPlanCandidate,
  IDayPlanInputReader,
  InspectorDayPlanContext,
} from '../../../domain/day-plan-input.reader';

function logger(): any {
  const l: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  l.child = () => l;
  return l;
}

const INSPECTOR_ID = '11111111-1111-1111-1111-111111111111';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DATE = '2026-11-05';
const NOW = new Date('2026-11-04T09:00:00.000Z'); // 20:00 Sydney on the 4th → D+1 window open

function candidate(id: string, lat: number, lng: number): DayPlanCandidate {
  return {
    appointmentId: id,
    appointmentCode: `INS-000${id === A ? 1 : 2}`,
    appointmentStatus: 'SCHEDULED',
    agencyName: 'Ray White',
    tenantTimezone: 'Australia/Sydney',
    scheduledDate: DATE,
    timeSlotStart: '08:00',
    timeSlotEnd: '17:00',
    windowStartAt: new Date('2026-11-04T21:00:00.000Z'),
    windowEndAt: new Date('2026-11-05T06:00:00.000Z'),
    durationMinutes: 45,
    serviceTypeName: 'Routine',
    lat,
    lng,
    propertyAddress: '12 King St, Surry Hills NSW 2010',
    suburb: 'Surry Hills',
    keyRequired: false,
    meetingLocation: null,
    rentalTenantConfirmationStatus: 'CONFIRMED',
    contacts: [{ name: 'Sam Lee', phone: '+61412345678', isPrimary: true, role: 'RENTAL_TENANT', createdAt: new Date('2026-11-01T00:00:00Z') }],
    startedAt: null,
    finishedAt: null,
    abandonedAt: null,
  };
}

class FakeReader implements IDayPlanInputReader {
  candidates: DayPlanCandidate[] = [candidate(A, -33.88, 151.1), candidate(B, -33.9, 151.2)];
  inspector: InspectorDayPlanContext = {
    inspectorId: INSPECTOR_ID,
    name: 'Jane Doe',
    timezone: 'Australia/Sydney',
    active: true,
    baseLat: -33.87,
    baseLng: 151.2,
    baseAddress: { line1: '1 Base St', suburb: 'Redfern', state: 'NSW', postcode: '2016', country: 'AU' } as never,
    baseGeocodeFailed: false,
  };
  async loadCandidates(): Promise<DayPlanCandidate[]> { return this.candidates.map((c) => ({ ...c })); }
  async loadInspectorContext(): Promise<InspectorDayPlanContext | null> { return { ...this.inspector }; }
}

class InMemoryRepo implements IDayPlanRepository {
  private store = new Map<string, DayPlanRecord>();
  saveCalls = 0;

  private key(inspectorId: string, date: string) { return `${inspectorId}:${date}`; }

  async findByInspectorAndDate(inspectorId: string, planDate: string): Promise<DayPlanRecord | null> {
    return this.store.get(this.key(inspectorId, planDate)) ?? null;
  }
  async saveComputed(input: SaveDayPlanInput): Promise<DayPlanRecord | null> {
    this.saveCalls++;
    const key = this.key(input.inspectorId, input.planDate);
    const current = this.store.get(key);
    if (input.expectedVersion === null) {
      if (current) return null;
      const rec = this.toRecord(input, crypto.randomUUID(), 1);
      this.store.set(key, rec);
      return rec;
    }
    if (!current || current.version !== input.expectedVersion) return null;
    const rec = this.toRecord(input, current.id, current.version + 1);
    this.store.set(key, rec);
    return rec;
  }
  async clearStale(id: string, expectedVersion: number): Promise<DayPlanRecord | null> {
    for (const rec of this.store.values()) {
      if (rec.id === id) {
        if (rec.version !== expectedVersion) return null;
        const next = { ...rec, status: (rec.publishedAt ? 'PUBLISHED' : 'DRAFT') as DayPlanRecord['status'], version: rec.version + 1, staleAt: null, staleReason: null };
        this.store.set(this.key(rec.inspectorId, rec.planDate), next);
        return next;
      }
    }
    return null;
  }
  async markStaleByAppointmentIds(): Promise<number> { return 0; }
  async markStaleByInspector(): Promise<number> { return 0; }
  async markNotified(): Promise<void> {}
  async purgePastRouteData(): Promise<number> { return 0; }
  async getEtaAccuracySamples() { return []; }

  private toRecord(input: SaveDayPlanInput, id: string, version: number): DayPlanRecord {
    const stops: DayPlanStopRecord[] = input.stops.map((s) => ({
      id: crypto.randomUUID(),
      appointmentId: s.appointmentId,
      sequence: s.sequence,
      eta: s.eta,
      serviceStartAt: s.serviceStartAt,
      serviceEndAt: s.serviceEndAt,
      publishedEta: s.publishedEta,
      publishedServiceStartAt: s.publishedServiceStartAt,
      publishedPredictedAt: s.publishedPredictedAt,
      publishedApproximate: s.publishedApproximate,
      travelS: s.travelS,
      distanceM: s.distanceM,
      waitS: s.waitS,
      lateS: s.lateS,
      windowStartAt: s.windowStartAt,
      windowEndAt: s.windowEndAt,
      windowTimezone: s.windowTimezone,
      durationMinutes: s.durationMinutes,
      lat: s.lat,
      lng: s.lng,
      manual: s.manual,
      executed: s.executed,
      approximate: s.approximate,
      missingCoordinates: s.missingCoordinates,
    }));
    return {
      id,
      inspectorId: input.inspectorId,
      planDate: input.planDate,
      timezone: input.timezone,
      status: input.status,
      version,
      inputFingerprint: input.inputFingerprint,
      publishedAt: input.publishedAt,
      notifiedAt: input.notifiedAt,
      computedAt: input.computedAt,
      computedByUserId: input.computedByUserId,
      lastTrigger: input.lastTrigger,
      staleAt: null,
      staleReason: null,
      originSource: input.originSource,
      originLat: input.originLat,
      originLng: input.originLng,
      originOverride: input.originOverride,
      originOverrideLat: input.originOverrideLat,
      originOverrideLng: input.originOverrideLng,
      originOverrideSetAt: input.originOverrideSetAt,
      departureAt: input.departureAt,
      finishEta: input.finishEta,
      totalDriveS: input.totalDriveS,
      totalWaitS: input.totalWaitS,
      totalServiceS: input.totalServiceS,
      totalLateS: input.totalLateS,
      totalDistanceM: input.totalDistanceM,
      feasible: input.feasible,
      manualOrder: input.manualOrder,
      suggestedOrder: input.suggestedOrder,
      weights: input.weights,
      optimizerMethod: input.optimizerMethod,
      routingProvider: input.routingProvider,
      matrixProfile: input.matrixProfile,
      approximate: input.approximate,
      approximateReason: input.approximateReason,
      routeGeometry: input.routeGeometry,
      routingMatrix: input.routingMatrix,
      legTravel: input.legTravel,
      geometryPurgedAt: null,
      stops,
    };
  }
}

const settings = { get: vi.fn(async () => ({ travel: 1, windowWait: 1, baseProximity: 1 })) };
const clock = { now: () => NOW };

function makeUseCase(reader: FakeReader, repo: InMemoryRepo) {
  const stub = new StubRoutingService();
  const planRoute = new PlanRouteService(stub, stub, logger(), new MetricsCollector());
  const compute = new ComputeDayPlanUseCase(reader, repo, planRoute, settings as never, logger(), clock);
  return new GetMyDayPlanUseCase(reader, repo, compute, clock);
}

describe('GetMyDayPlanUseCase', () => {
  let reader: FakeReader;
  let repo: InMemoryRepo;
  beforeEach(() => { reader = new FakeReader(); repo = new InMemoryRepo(); });

  it('computes and publishes the D+1 plan on first open (01.A1/01.A3)', async () => {
    const res = await makeUseCase(reader, repo).execute({ inspectorId: INSPECTOR_ID, date: DATE });
    expect(res.status).toBe('PUBLISHED');
    expect(res.version).toBe(1);
    expect(res.stops.map((s) => s.appointmentId).sort()).toEqual([A, B].sort());
    expect(res.origin.source).toBe('BASE');
    expect(res.publishedAt).not.toBeNull();
    expect(res.inspectorName).toBe('Jane Doe');
    expect(res.stops[0]!.primaryContact).toMatchObject({ name: 'Sam Lee', role: 'RENTAL_TENANT' });
  });

  it('returns a fresh plan on the second open without recomputing', async () => {
    const uc = makeUseCase(reader, repo);
    await uc.execute({ inspectorId: INSPECTOR_ID, date: DATE });
    const callsAfterFirst = repo.saveCalls;
    const res = await uc.execute({ inspectorId: INSPECTOR_ID, date: DATE });
    expect(repo.saveCalls).toBe(callsAfterFirst); // fingerprint fresh → no save
    expect(res.version).toBe(1);
  });

  it('reports NO_BASE when the inspector has no base address', async () => {
    reader.inspector = { ...reader.inspector, baseLat: null, baseLng: null, baseAddress: null, baseGeocodeFailed: false };
    const res = await makeUseCase(reader, repo).execute({ inspectorId: INSPECTOR_ID, date: DATE });
    expect(res.origin.source).toBe('NONE');
    expect(res.originWarning).toBe('NO_BASE');
  });
});
