import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { MetricsCollector } from '../../../../../shared/infrastructure/metrics';
import { StubRoutingService } from '../../../infrastructure/routing/stub-routing.service';
import { PlanRouteService } from '../../services/plan-route.service';
import { ComputeDayPlanUseCase } from '../compute-day-plan.use-case';
import { GetMyDayPlanUseCase } from '../get-my-day-plan.use-case';
import { RecalculateDayPlanUseCase } from '../recalculate-day-plan.use-case';
import type { DayPlanRecord, DayPlanStopRecord } from '../../../domain/day-plan.entity';
import type { IDayPlanRepository, SaveDayPlanInput } from '../../../domain/day-plan.repository';
import type { DayPlanCandidate, IDayPlanInputReader, InspectorDayPlanContext } from '../../../domain/day-plan-input.reader';

function logger(): any { const l: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }; l.child = () => l; return l; }

const I = '11111111-1111-1111-1111-111111111111';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DATE = '2026-11-05';
const NOW = new Date('2026-11-04T09:00:00.000Z');

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
const INSP: AuthContext = { userId: 'u', tenantId: null, role: 'INSP', inspectorId: I } as AuthContext;

function wire(reader: FakeReader, repo: Repo) {
  const stubR = new StubRoutingService();
  const planRoute = new PlanRouteService(stubR, stubR, logger(), new MetricsCollector());
  const compute = new ComputeDayPlanUseCase(reader, repo, planRoute, settings as never, logger(), clock);
  const getMy = new GetMyDayPlanUseCase(reader, repo, compute, clock);
  const recalc = new RecalculateDayPlanUseCase(reader, repo, compute, audit as never, clock);
  return { getMy, recalc };
}

describe('RecalculateDayPlanUseCase', () => {
  let reader: FakeReader; let repo: Repo;
  beforeEach(() => { reader = new FakeReader(); repo = new Repo(); audit.log.mockClear(); });

  it('forbids an inspector recalculating another inspector (IDOR guard)', async () => {
    const { recalc } = wire(reader, repo);
    const other = '99999999-9999-9999-9999-999999999999';
    await expect(
      recalc.execute({ actor: INSP, inspectorId: other, date: DATE }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('recalculates the inspector own plan and audits it', async () => {
    const { getMy, recalc } = wire(reader, repo);
    await getMy.execute({ inspectorId: I, date: DATE });
    const result = await recalc.execute({ actor: INSP, inspectorId: I, date: DATE });
    expect(result).toBeDefined();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'day_plan.recalculated', entityType: 'DayPlan' }),
    );
  });
});
