import { describe, it, expect, vi } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../../shared/domain/errors';
import { GetDayPlanForOperatorUseCase } from '../get-day-plan-for-operator.use-case';
import type { DayPlanRecord } from '../../../domain/day-plan.entity';
import type { IDayPlanRepository } from '../../../domain/day-plan.repository';
import type { DayPlanCandidate, IDayPlanInputReader, InspectorDayPlanContext } from '../../../domain/day-plan-input.reader';

const INSPECTOR_ID = '11111111-1111-1111-1111-111111111111';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DATE = '2026-11-05';
const NOW = new Date('2026-11-04T09:00:00.000Z');

function candidate(durationMinutes = 45): DayPlanCandidate {
  return {
    appointmentId: A, appointmentCode: 'INS-0001', appointmentStatus: 'SCHEDULED', agencyName: 'Ray White',
    tenantTimezone: 'Australia/Sydney', scheduledDate: DATE, timeSlotStart: '08:00', timeSlotEnd: '17:00',
    windowStartAt: new Date('2026-11-04T21:00:00Z'), windowEndAt: new Date('2026-11-05T06:00:00Z'),
    durationMinutes, serviceTypeName: 'Routine', lat: -33.88, lng: 151.1,
    propertyAddress: '12 King St, Surry Hills NSW 2010', suburb: 'Surry Hills', keyRequired: false,
    meetingLocation: null, rentalTenantConfirmationStatus: 'CONFIRMED', contacts: [], startedAt: null,
    finishedAt: null, abandonedAt: null,
  };
}

const inspector: InspectorDayPlanContext = {
  inspectorId: INSPECTOR_ID, name: 'Jane Doe', timezone: 'Australia/Sydney', active: true,
  baseLat: -33.87, baseLng: 151.2, baseAddress: null, baseGeocodeFailed: false,
};

function record(fingerprint: string): DayPlanRecord {
  return {
    id: 'plan-1', inspectorId: INSPECTOR_ID, planDate: DATE, timezone: 'Australia/Sydney', status: 'PUBLISHED',
    version: 3, inputFingerprint: fingerprint, publishedAt: NOW, notifiedAt: null, computedAt: NOW,
    computedByUserId: null, lastTrigger: 'SCHEDULED_PUBLISH', staleAt: null, staleReason: null, originSource: 'BASE',
    originLat: -33.87, originLng: 151.2, originOverride: null, originOverrideLat: null, originOverrideLng: null,
    originOverrideSetAt: null, departureAt: NOW, finishEta: NOW, totalDriveS: 600, totalWaitS: 0, totalServiceS: 2700,
    totalLateS: 0, totalDistanceM: 4700, feasible: true, manualOrder: false, suggestedOrder: [A],
    weights: { travel: 1, windowWait: 1, baseProximity: 1 }, optimizerMethod: 'EXACT', routingProvider: 'STUB',
    matrixProfile: 'haversine', approximate: true, approximateReason: 'NO_PROVIDER', routeGeometry: null,
    routingMatrix: null, legTravel: null, geometryPurgedAt: null,
    stops: [{
      id: 's1', appointmentId: A, sequence: 1, eta: NOW, serviceStartAt: NOW, serviceEndAt: NOW, publishedEta: NOW,
      publishedServiceStartAt: NOW, publishedPredictedAt: NOW, publishedApproximate: true, travelS: 600, distanceM: 4700,
      waitS: 0, lateS: 0, windowStartAt: new Date('2026-11-04T21:00:00Z'), windowEndAt: new Date('2026-11-05T06:00:00Z'),
      windowTimezone: 'Australia/Sydney', durationMinutes: 45, lat: -33.88, lng: 151.1, manual: false, executed: false,
      approximate: true, missingCoordinates: false,
    }],
  };
}

class FakeReader implements IDayPlanInputReader {
  candidate = candidate();
  async loadCandidates(): Promise<DayPlanCandidate[]> { return [{ ...this.candidate }]; }
  async loadAppointmentPlanKey() { return null; }
  async loadInspectorContext(): Promise<InspectorDayPlanContext | null> { return { ...inspector }; }
}

function repoWith(rec: DayPlanRecord | null) {
  return {
    findByInspectorAndDate: vi.fn(async () => rec),
    saveComputed: vi.fn(), clearStale: vi.fn(), markStaleByAppointmentIds: vi.fn(), markStaleByInspector: vi.fn(),
    markNotified: vi.fn(), purgePastRouteData: vi.fn(), getEtaAccuracySamples: vi.fn(),
  } as unknown as IDayPlanRepository & { saveComputed: ReturnType<typeof vi.fn> };
}

const auth = { assertRoles: (actor: AuthContext, roles: string[]) => { if (!roles.includes(actor.role)) throw new ForbiddenError('FORBIDDEN', `Role ${actor.role} is not permitted to perform day_plan.view`); } };
const clock = { now: () => NOW };
const AM: AuthContext = { userId: 'u1', tenantId: null, role: 'AM', inspectorId: null } as AuthContext;
const CL: AuthContext = { userId: 'u2', tenantId: 't1', role: 'CL_ADMIN', inspectorId: null } as AuthContext;

describe('GetDayPlanForOperatorUseCase', () => {
  it('returns the stored plan to AM without recomputing', async () => {
    const reader = new FakeReader();
    // Use the plan's own fingerprint so it reads as fresh.
    const { fingerprintForCandidates } = await import('../../day-plan-inputs');
    const fp = fingerprintForCandidates([reader.candidate], { source: 'BASE', lat: -33.87, lng: 151.2, override: null });
    const repo = repoWith(record(fp));
    const res = await new GetDayPlanForOperatorUseCase(reader, repo, auth as never, clock).execute({ actor: AM, inspectorId: INSPECTOR_ID, date: DATE });
    expect(res.status).toBe('PUBLISHED');
    expect(repo.saveComputed).not.toHaveBeenCalled();
  });

  it('reports STALE when the fingerprint diverges, still without recomputing', async () => {
    const reader = new FakeReader();
    const repo = repoWith(record('a-different-fingerprint'));
    const res = await new GetDayPlanForOperatorUseCase(reader, repo, auth as never, clock).execute({ actor: AM, inspectorId: INSPECTOR_ID, date: DATE });
    expect(res.status).toBe('STALE');
    expect(repo.saveComputed).not.toHaveBeenCalled();
  });

  it('forbids CL roles', async () => {
    const reader = new FakeReader();
    await expect(
      new GetDayPlanForOperatorUseCase(reader, repoWith(record('x')), auth as never, clock).execute({ actor: CL, inspectorId: INSPECTOR_ID, date: DATE }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('404s when there is no plan', async () => {
    const reader = new FakeReader();
    await expect(
      new GetDayPlanForOperatorUseCase(reader, repoWith(null), auth as never, clock).execute({ actor: AM, inspectorId: INSPECTOR_ID, date: DATE }),
    ).rejects.toMatchObject({ code: 'DAY_PLAN_NOT_FOUND' });
  });
});
