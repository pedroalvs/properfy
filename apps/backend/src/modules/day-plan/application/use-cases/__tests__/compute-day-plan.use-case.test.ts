import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetricsCollector } from '../../../../../shared/infrastructure/metrics';
import { StubRoutingService } from '../../../infrastructure/routing/stub-routing.service';
import { PlanRouteService } from '../../services/plan-route.service';
import { ComputeDayPlanUseCase } from '../compute-day-plan.use-case';
import { configuredOriginFor, fingerprintForCandidates } from '../../day-plan-inputs';
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
const NOW = new Date('2026-11-04T09:00:00.000Z'); // 20:00 Sydney on the 4th → D+1 publish window open

// A is west (near the override origin), B is east (near the base). So the optimizer
// from the BASE orders [B, A], and from an override near A orders [A, B].
const A_LAT = -33.8;
const A_LNG = 151.1;
const B_LAT = -33.8;
const B_LNG = 151.3;
const BASE_LAT = -33.8;
const BASE_LNG = 151.3;

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
    contacts: [
      { name: 'Sam Lee', phone: '+61412345678', isPrimary: true, role: 'RENTAL_TENANT', createdAt: new Date('2026-11-01T00:00:00Z') },
    ],
    startedAt: null,
    finishedAt: null,
    abandonedAt: null,
  };
}

class FakeReader implements IDayPlanInputReader {
  candidates: DayPlanCandidate[] = [candidate(A, A_LAT, A_LNG), candidate(B, B_LAT, B_LNG)];
  inspector: InspectorDayPlanContext = {
    inspectorId: INSPECTOR_ID,
    name: 'Jane Doe',
    timezone: 'Australia/Sydney',
    active: true,
    baseLat: BASE_LAT,
    baseLng: BASE_LNG,
    baseAddress: { line1: '1 Base St', suburb: 'Redfern', state: 'NSW', postcode: '2016', country: 'AU' } as never,
    baseGeocodeFailed: false,
  };
  async loadCandidates(): Promise<DayPlanCandidate[]> {
    return this.candidates.map((c) => ({ ...c }));
  }
  async loadAppointmentPlanKey() {
    return null;
  }
  async loadInspectorContext(): Promise<InspectorDayPlanContext | null> {
    return { ...this.inspector };
  }
}

class InMemoryRepo implements IDayPlanRepository {
  private store = new Map<string, DayPlanRecord>();
  saveCalls = 0;
  lastSaved: SaveDayPlanInput | null = null;

  private key(inspectorId: string, date: string) {
    return `${inspectorId}:${date}`;
  }

  forceRecord(rec: DayPlanRecord): void {
    this.store.set(this.key(rec.inspectorId, rec.planDate), rec);
  }

  async findByInspectorAndDate(inspectorId: string, planDate: string): Promise<DayPlanRecord | null> {
    return this.store.get(this.key(inspectorId, planDate)) ?? null;
  }
  async saveComputed(input: SaveDayPlanInput): Promise<DayPlanRecord | null> {
    this.saveCalls++;
    this.lastSaved = input;
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
  async clearStale(): Promise<DayPlanRecord | null> {
    return null;
  }
  async markStaleByAppointmentIds(): Promise<number> {
    return 0;
  }
  async markStaleByInspector(): Promise<number> {
    return 0;
  }
  async markNotified(): Promise<void> {}
  async getEtaAccuracySamples() {
    return [];
  }
  async loadPublishDue() {
    return [];
  }

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
      stops,
    };
  }
}

const settings = { get: vi.fn(async () => ({ travel: 1, windowWait: 1, baseProximity: 1 })) };
const clock = { now: () => NOW };

function make(reader: FakeReader, repo: InMemoryRepo) {
  const stub = new StubRoutingService();
  const planRoute = new PlanRouteService(stub, stub, logger(), new MetricsCollector());
  const compute = new ComputeDayPlanUseCase(reader, repo, planRoute, settings as never, logger(), clock);
  return { compute, planRoute, repo, reader };
}

/** A reorderable (not-executed) stop record for a seeded existing plan. */
function stopRec(reader: FakeReader, id: string, sequence: number): DayPlanStopRecord {
  const c = reader.candidates.find((x) => x.appointmentId === id)!;
  return {
    id: crypto.randomUUID(),
    appointmentId: id,
    sequence,
    eta: new Date('2026-11-04T22:00:00Z'),
    serviceStartAt: new Date('2026-11-04T22:00:00Z'),
    serviceEndAt: new Date('2026-11-04T22:45:00Z'),
    publishedEta: null,
    publishedServiceStartAt: null,
    publishedPredictedAt: null,
    publishedApproximate: null,
    travelS: 600,
    distanceM: 6000,
    waitS: 0,
    lateS: 0,
    windowStartAt: c.windowStartAt,
    windowEndAt: c.windowEndAt,
    windowTimezone: 'Australia/Sydney',
    durationMinutes: 45,
    lat: c.lat,
    lng: c.lng,
    manual: true,
    executed: false,
    approximate: false,
    missingCoordinates: false,
  };
}

function seedManualPlan(
  reader: FakeReader,
  repo: InMemoryRepo,
  opts: { order: string[]; suggestedOrder: string[]; fingerprint: string; manualOrder?: boolean },
): DayPlanRecord {
  const rec: DayPlanRecord = {
    id: crypto.randomUUID(),
    inspectorId: INSPECTOR_ID,
    planDate: DATE,
    timezone: 'Australia/Sydney',
    status: 'PUBLISHED',
    version: 1,
    inputFingerprint: opts.fingerprint,
    publishedAt: new Date('2026-11-04T08:30:00Z'),
    notifiedAt: null,
    computedAt: new Date('2026-11-04T08:30:00Z'),
    computedByUserId: null,
    lastTrigger: 'ON_OPEN',
    staleAt: null,
    staleReason: null,
    originSource: 'BASE',
    originLat: BASE_LAT,
    originLng: BASE_LNG,
    originOverride: null,
    originOverrideLat: null,
    originOverrideLng: null,
    originOverrideSetAt: null,
    departureAt: new Date('2026-11-04T21:00:00Z'),
    finishEta: new Date('2026-11-04T23:30:00Z'),
    totalDriveS: 1200,
    totalWaitS: 0,
    totalServiceS: 5400,
    totalLateS: 0,
    totalDistanceM: 12000,
    feasible: true,
    manualOrder: opts.manualOrder ?? true,
    suggestedOrder: opts.suggestedOrder,
    weights: { travel: 1, windowWait: 1, baseProximity: 1 } as never,
    optimizerMethod: 'FIXED',
    routingProvider: 'STUB',
    matrixProfile: null,
    approximate: false,
    approximateReason: null,
    stops: opts.order.map((id, i) => stopRec(reader, id, i + 1)),
  };
  repo.forceRecord(rec);
  return rec;
}

describe('ComputeDayPlanUseCase — suggested order (PR-03, D-06/01.A2)', () => {
  let reader: FakeReader;
  let repo: InMemoryRepo;
  beforeEach(() => {
    reader = new FakeReader();
    repo = new InMemoryRepo();
  });

  it('Batedor: an ORIGIN_CHANGE on a manual plan recomputes the suggestion (≠ the manual order)', async () => {
    // Manual order [B, A] saved; the stored suggestion collapsed to it (the bug).
    seedManualPlan(reader, repo, { order: [B, A], suggestedOrder: [B, A], fingerprint: 'stale-origin-fp' });

    const { compute, planRoute } = make(reader, repo);
    const computeSpy = vi.spyOn(planRoute, 'compute');

    await compute.execute({
      inspectorId: INSPECTOR_ID,
      date: DATE,
      trigger: 'ORIGIN_CHANGE',
      applyOrigin: {
        address: { line1: '1 West St', suburb: 'West', state: 'NSW', postcode: '2000', country: 'AU' } as never,
        lat: A_LAT,
        lng: A_LNG,
      },
    });

    const saved = repo.lastSaved!;
    const appliedOrder = saved.stops.filter((s) => !s.executed).sort((a, b) => a.sequence - b.sequence).map((s) => s.appointmentId);
    expect(saved.manualOrder).toBe(true);
    expect(appliedOrder).toEqual([B, A]); // the manual order is still applied
    expect(saved.suggestedOrder).toEqual([A, B]); // optimizer suggestion for the new origin
    expect(saved.suggestedOrder).not.toEqual(appliedOrder); // no longer "Same finish time as suggested"
    // The recompute uses the provider matrix (publication-quality suggestion → delta ≥ 0).
    expect(computeSpy.mock.calls[0]![0].forceProviderMatrix).toBe(true);
  });

  it('no-change reopen (ON_OPEN, same fingerprint) keeps the stored suggestion and forces no provider Matrix', async () => {
    const baseOrigin = configuredOriginFor(null, reader.inspector);
    const fp = fingerprintForCandidates(reader.candidates, baseOrigin);
    // Stored provider suggestion is a sentinel the optimizer could never reproduce.
    seedManualPlan(reader, repo, { order: [A, B], suggestedOrder: ['SENTINEL'], fingerprint: fp });

    const { compute, planRoute } = make(reader, repo);
    const computeSpy = vi.spyOn(planRoute, 'compute');

    await compute.execute({ inspectorId: INSPECTOR_ID, date: DATE, trigger: 'ON_OPEN' });

    expect(repo.lastSaved!.suggestedOrder).toEqual(['SENTINEL']); // preserved, not degraded to a stub order
    expect(computeSpy.mock.calls[0]![0].forceProviderMatrix).toBeFalsy();
  });

  it('REORDER (FIXED_ORDER) still keeps the prior optimizer suggestion (#1378 unbroken)', async () => {
    seedManualPlan(reader, repo, { order: [A, B], suggestedOrder: ['PRIOR'], fingerprint: 'any-fp', manualOrder: false });

    const { compute } = make(reader, repo);

    await compute.execute({ inspectorId: INSPECTOR_ID, date: DATE, trigger: 'REORDER', fixedOrder: [B, A] });

    const saved = repo.lastSaved!;
    const appliedOrder = saved.stops.filter((s) => !s.executed).sort((a, b) => a.sequence - b.sequence).map((s) => s.appointmentId);
    expect(saved.manualOrder).toBe(true);
    expect(appliedOrder).toEqual([B, A]);
    expect(saved.suggestedOrder).toEqual(['PRIOR']); // #1378: FIXED_ORDER keeps the prior suggestion
  });
});
