import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetricsCollector } from '../../../../../shared/infrastructure/metrics';
import { StubRoutingService } from '../../../infrastructure/routing/stub-routing.service';
import { PlanRouteService } from '../../services/plan-route.service';
import { PreviewDayPlanOrderUseCase } from '../preview-day-plan-order.use-case';
import type { IDayPlanRepository } from '../../../domain/day-plan.repository';
import type { DayPlanRecord } from '../../../domain/day-plan.entity';
import type { DayPlanCandidate, IDayPlanInputReader, InspectorDayPlanContext } from '../../../domain/day-plan-input.reader';

function logger(): never {
  const l: Record<string, unknown> = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  l.child = () => l;
  return l as never;
}

const INSPECTOR_ID = '11111111-1111-1111-1111-111111111111';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DATE = '2026-11-05';
const NOW = new Date('2026-11-04T09:00:00.000Z'); // 20:00 Sydney on the 4th

function candidate(id: string, lng: number, over: Partial<DayPlanCandidate> = {}): DayPlanCandidate {
  return {
    appointmentId: id, appointmentCode: 'INS-0001', appointmentStatus: 'SCHEDULED', agencyName: 'RW',
    tenantTimezone: 'Australia/Sydney', scheduledDate: DATE, timeSlotStart: '08:00', timeSlotEnd: '17:00',
    windowStartAt: new Date('2026-11-04T21:00:00Z'), windowEndAt: new Date('2026-11-05T06:00:00Z'),
    durationMinutes: 45, serviceTypeName: 'Routine', lat: -33.88, lng, propertyAddress: 'x', suburb: 'Surry Hills',
    keyRequired: false, meetingLocation: null, rentalTenantConfirmationStatus: 'CONFIRMED', contacts: [],
    startedAt: null, finishedAt: null, abandonedAt: null, ...over,
  };
}

class FakeReader implements IDayPlanInputReader {
  candidates: DayPlanCandidate[] = [candidate(A, 151.1), candidate(B, 151.2), candidate(C, 151.3)];
  active = true;
  async loadCandidates(): Promise<DayPlanCandidate[]> { return this.candidates.map((c) => ({ ...c })); }
  async loadAppointmentPlanKey() { return null; }
  async loadInspectorContext(): Promise<InspectorDayPlanContext | null> {
    return { inspectorId: INSPECTOR_ID, name: 'Jane', timezone: 'Australia/Sydney', active: this.active, baseLat: -33.87, baseLng: 151.2, baseAddress: null, baseGeocodeFailed: false };
  }
}

function plan(): DayPlanRecord {
  return {
    id: 'plan-1', inspectorId: INSPECTOR_ID, planDate: DATE, timezone: 'Australia/Sydney', status: 'PUBLISHED', version: 4,
    inputFingerprint: 'fp', publishedAt: NOW, notifiedAt: null, computedAt: NOW, computedByUserId: null, lastTrigger: 'SCHEDULED_PUBLISH',
    staleAt: null, staleReason: null, originSource: 'BASE', originLat: -33.87, originLng: 151.2, originOverride: null,
    originOverrideLat: null, originOverrideLng: null, originOverrideSetAt: null, departureAt: NOW, finishEta: NOW,
    totalDriveS: 0, totalWaitS: 0, totalServiceS: 0, totalLateS: 0, totalDistanceM: null, feasible: true, manualOrder: false,
    suggestedOrder: [A, B, C], weights: { travel: 1, windowWait: 1, baseProximity: 1 }, optimizerMethod: 'EXACT',
    routingProvider: 'STUB', matrixProfile: 'haversine', approximate: false, approximateReason: null,
    stops: [],
  };
}

function setup(rec: DayPlanRecord | null = plan()) {
  const reader = new FakeReader();
  const repo = {
    findByInspectorAndDate: vi.fn(async () => rec),
    saveComputed: vi.fn(), clearStale: vi.fn(), markStaleByAppointmentIds: vi.fn(), markStaleByInspector: vi.fn(),
    markNotified: vi.fn(), getEtaAccuracySamples: vi.fn(), loadPublishDue: vi.fn(),
  } as unknown as IDayPlanRepository & Record<string, ReturnType<typeof vi.fn>>;
  const stub = new StubRoutingService();
  const matrixSpy = vi.spyOn(stub, 'matrix');
  const planRoute = new PlanRouteService(stub, stub, logger(), new MetricsCollector());
  const uc = new PreviewDayPlanOrderUseCase(reader, repo, planRoute, { now: () => NOW });
  return { reader, repo, uc, matrixSpy, planRoute };
}

const base = { inspectorId: INSPECTOR_ID, date: DATE, basedOnVersion: 4 };

describe('PreviewDayPlanOrderUseCase', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => { ctx = setup(); });

  it('evaluates the candidate order over a freshly computed matrix, in the candidate order (01.A3/00.A5)', async () => {
    const order = [C, A, B];
    const res = await ctx.uc.execute({ ...base, appointmentIds: order });
    expect(res.etaSource).toBe('MATRIX');
    expect(res.stops.map((s) => s.appointmentId)).toEqual(order);
    expect(res.stops.map((s) => s.sequence)).toEqual([1, 2, 3]);
    expect(res.totals.driveS).toBeGreaterThan(0);
    expect(res.stops.every((s) => s.eta !== null)).toBe(true);
    expect(ctx.matrixSpy).toHaveBeenCalledTimes(1); // matrix recomputed on demand, nothing cached
  });

  it('persists nothing', async () => {
    await ctx.uc.execute({ ...base, appointmentIds: [B, A, C] });
    expect(ctx.repo.saveComputed).not.toHaveBeenCalled();
    expect(ctx.repo.clearStale).not.toHaveBeenCalled();
    expect(ctx.repo.markNotified).not.toHaveBeenCalled();
  });

  it('404s when there is no plan or the inspector is inactive', async () => {
    await expect(setup(null).uc.execute({ ...base, appointmentIds: [A, B] })).rejects.toMatchObject({ code: 'DAY_PLAN_NOT_FOUND' });
    ctx.reader.active = false;
    await expect(ctx.uc.execute({ ...base, appointmentIds: [A, B, C] })).rejects.toMatchObject({ code: 'DAY_PLAN_NOT_FOUND' });
  });

  it('previews the not-started tail of a started day from the last executed stop (LAST_STOP origin), like PUT /order', async () => {
    const today = '2026-11-04';
    const s = setup({ ...plan(), planDate: today });
    const finishedAt = new Date('2026-11-04T10:30:00Z'); // after NOW => earliest departure
    s.reader.candidates = [
      candidate(A, 151.1, { startedAt: new Date('2026-11-04T01:00:00Z'), finishedAt, appointmentStatus: 'DONE' }),
      candidate(B, 151.2),
      candidate(C, 151.3),
    ];
    const spy = vi.spyOn(s.planRoute, 'previewOrder');
    const res = await s.uc.execute({ ...base, date: today, appointmentIds: [C, B] });
    expect(res.stops.map((x) => x.appointmentId)).toEqual([C, B]);
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0]![0];
    expect(arg.origin).toEqual({ lat: -33.88, lng: 151.1 }); // last executed stop, not the base
    expect(arg.earliestDepartureAt).toEqual(finishedAt);
    expect(arg.stops.map((x) => x.appointmentId)).toEqual([B, C]); // executed stop excluded
  });

  it('400 DAY_PLAN_ORDER_MISMATCH on a started day when the candidate includes the executed stop', async () => {
    const today = '2026-11-04';
    const s = setup({ ...plan(), planDate: today });
    s.reader.candidates = [
      candidate(A, 151.1, { startedAt: new Date('2026-11-04T01:00:00Z'), finishedAt: new Date('2026-11-04T02:00:00Z'), appointmentStatus: 'DONE' }),
      candidate(B, 151.2),
      candidate(C, 151.3),
    ];
    await expect(s.uc.execute({ ...base, date: today, appointmentIds: [A, B, C] })).rejects.toMatchObject({ code: 'DAY_PLAN_ORDER_MISMATCH' });
  });

  it('409 DAY_PLAN_VERSION_CONFLICT when basedOnVersion differs', async () => {
    await expect(ctx.uc.execute({ ...base, basedOnVersion: 3, appointmentIds: [A, B, C] })).rejects.toMatchObject({
      code: 'DAY_PLAN_VERSION_CONFLICT',
      details: { currentVersion: 4 },
    });
  });

  it('409 when fewer than two stops are reorderable', async () => {
    ctx.reader.candidates = [candidate(A, 151.1)];
    await expect(ctx.uc.execute({ ...base, appointmentIds: [A] })).rejects.toMatchObject({ code: 'DAY_PLAN_NOTHING_TO_REORDER' });
  });

  it('400 when the candidate set does not match the reorderable stops', async () => {
    await expect(ctx.uc.execute({ ...base, appointmentIds: [A, B] })).rejects.toMatchObject({ code: 'DAY_PLAN_ORDER_MISMATCH', statusCode: 400 });
  });
});
