import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InspectorBaseAddress } from '@properfy/shared';
import { MetricsCollector } from '../../../../../shared/infrastructure/metrics';
import { StubRoutingService } from '../../../infrastructure/routing/stub-routing.service';
import { PlanRouteService } from '../../services/plan-route.service';
import { ComputeDayPlanUseCase } from '../compute-day-plan.use-case';
import { GetMyDayPlanUseCase } from '../get-my-day-plan.use-case';
import { SetDayPlanOriginUseCase, ClearDayPlanOriginUseCase } from '../day-plan-origin.use-case';
import { GeocodeTimeoutError } from '../../../../property/application/services/geocode-with-timeout';
import type { IDayPlanRepository, SaveDayPlanInput } from '../../../domain/day-plan.repository';
import type { DayPlanRecord, DayPlanStopRecord } from '../../../domain/day-plan.entity';
import type { DayPlanCandidate, IDayPlanInputReader, InspectorDayPlanContext } from '../../../domain/day-plan-input.reader';

function logger(): any { const l: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }; l.child = () => l; return l; }

const I = '11111111-1111-1111-1111-111111111111';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DATE = '2026-11-05';
const NOW = new Date('2026-11-04T09:00:00.000Z');
const ADDRESS: InspectorBaseAddress = { street: '9 Newtown Rd', city: 'Sydney', suburb: 'Newtown', state: 'NSW', postcode: '2042', country: 'AU' };

function candidate(id: string, lng: number, startedAt: Date | null = null): DayPlanCandidate {
  return { appointmentId: id, appointmentCode: 'INS-0001', appointmentStatus: 'SCHEDULED', agencyName: 'RW',
    tenantTimezone: 'Australia/Sydney', scheduledDate: DATE, timeSlotStart: '08:00', timeSlotEnd: '17:00',
    windowStartAt: new Date('2026-11-04T21:00:00Z'), windowEndAt: new Date('2026-11-05T06:00:00Z'), durationMinutes: 45,
    serviceTypeName: 'Routine', lat: -33.88, lng, propertyAddress: 'x', suburb: 'Surry Hills', keyRequired: false,
    meetingLocation: null, rentalTenantConfirmationStatus: 'CONFIRMED', contacts: [], startedAt, finishedAt: null, abandonedAt: null };
}

class FakeReader implements IDayPlanInputReader {
  candidates = [candidate(A, 151.1), candidate(B, 151.2)];
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
  async markNotified() {} async getEtaAccuracySamples() { return []; }
  async loadPublishDue() { return []; }
  private toRec(input: SaveDayPlanInput, id: string, version: number): DayPlanRecord {
    return { ...(input as unknown as DayPlanRecord), id, version, staleAt: null, staleReason: null,
      stops: input.stops.map((s, i) => ({ ...(s as unknown as DayPlanStopRecord), id: `s${i}` })) };
  }
}
const settings = { get: vi.fn(async () => ({ travel: 1, windowWait: 1, baseProximity: 1 })) };
const clock = { now: () => NOW };
const audit = { log: vi.fn() };

function wire(reader: FakeReader, repo: Repo, geocode: () => Promise<{ lat: number; lng: number } | null>) {
  const stub = new StubRoutingService();
  const planRoute = new PlanRouteService(stub, stub, logger(), new MetricsCollector());
  const compute = new ComputeDayPlanUseCase(reader, repo, planRoute, settings as never, logger(), clock);
  const getMy = new GetMyDayPlanUseCase(reader, repo, compute, clock);
  const geocoder = { geocode: vi.fn(geocode) };
  const set = new SetDayPlanOriginUseCase(reader, repo, compute, clock, geocoder as never, audit as never, logger());
  const clear = new ClearDayPlanOriginUseCase(reader, repo, compute, clock, audit as never);
  return { getMy, set, clear };
}

describe('SetDayPlanOriginUseCase', () => {
  let reader: FakeReader; let repo: Repo;
  beforeEach(() => { reader = new FakeReader(); repo = new Repo(); audit.log.mockClear(); });

  it('geocodes the address and applies it as the OVERRIDE origin', async () => {
    const { getMy, set } = wire(reader, repo, async () => ({ lat: -33.9, lng: 151.18 }));
    await getMy.execute({ inspectorId: I, date: DATE });
    const res = await set.execute({ inspectorId: I, actorUserId: 'u1', date: DATE, address: ADDRESS });
    expect(res.origin.source).toBe('OVERRIDE');
    expect(res.originOverride?.address.suburb).toBe('Newtown');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'day_plan.origin_overridden', after: { suburb: 'Newtown', state: 'NSW', postcode: '2042' } }));
  });

  it('422s when geocoding finds nothing', async () => {
    const { getMy, set } = wire(reader, repo, async () => null);
    await getMy.execute({ inspectorId: I, date: DATE });
    await expect(set.execute({ inspectorId: I, actorUserId: 'u1', date: DATE, address: ADDRESS })).rejects.toMatchObject({ code: 'DAY_PLAN_ORIGIN_NOT_FOUND' });
  });

  it('503s on any geocoder error (never 500)', async () => {
    const { getMy, set } = wire(reader, repo, async () => { throw new GeocodeTimeoutError(4000); });
    await getMy.execute({ inspectorId: I, date: DATE });
    await expect(set.execute({ inspectorId: I, actorUserId: 'u1', date: DATE, address: ADDRESS })).rejects.toMatchObject({ code: 'DAY_PLAN_ORIGIN_GEOCODER_UNAVAILABLE' });
  });

  it('422 DAY_PLAN_ALREADY_STARTED once a stop is executed (before geocoding)', async () => {
    reader.candidates[0] = candidate(A, 151.1, new Date('2026-11-04T22:00:00Z'));
    const geocoder = vi.fn();
    const { getMy, set } = wire(reader, repo, geocoder as never);
    // Seed plan while not started, then mark started.
    await getMy.execute({ inspectorId: I, date: '2026-11-04' }); // today
    await expect(set.execute({ inspectorId: I, actorUserId: 'u1', date: '2026-11-04', address: ADDRESS })).rejects.toMatchObject({ code: 'DAY_PLAN_ALREADY_STARTED' });
  });
});

describe('ClearDayPlanOriginUseCase', () => {
  it('clears the override and falls back to the base origin', async () => {
    const reader = new FakeReader(); const repo = new Repo();
    const { getMy, set, clear } = wire(reader, repo, async () => ({ lat: -33.9, lng: 151.18 }));
    await getMy.execute({ inspectorId: I, date: DATE });
    await set.execute({ inspectorId: I, actorUserId: 'u1', date: DATE, address: ADDRESS });
    const res = await clear.execute({ inspectorId: I, actorUserId: 'u1', date: DATE });
    expect(res.origin.source).toBe('BASE');
    expect(res.originOverride).toBeNull();
  });
});
