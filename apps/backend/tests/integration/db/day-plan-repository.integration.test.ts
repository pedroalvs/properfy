/**
 * Real-Postgres test for the day-plan repository SQL surface a mock cannot
 * validate: optimistic CAS on `saveComputed`, the L-F04-04 status-join filter,
 * the timezone-correct STALE marking, and the route-data purge.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaDayPlanRepository } from '../../../src/modules/day-plan/infrastructure/prisma-day-plan.repository';
import type { SaveDayPlanInput, SaveDayPlanStop } from '../../../src/modules/day-plan/domain/day-plan.repository';

let harness: DbHarness;
let repo: PrismaDayPlanRepository;

const seed = { inspectorId: '', apptA: '', apptB: '', userId: '' };

function todayCivilSydney(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
}

function stop(appointmentId: string, sequence: number, over: Partial<SaveDayPlanStop> = {}): SaveDayPlanStop {
  return {
    appointmentId,
    sequence,
    eta: new Date('2026-11-05T21:00:00Z'),
    serviceStartAt: new Date('2026-11-05T21:00:00Z'),
    serviceEndAt: new Date('2026-11-05T21:45:00Z'),
    publishedEta: null,
    publishedServiceStartAt: null,
    publishedPredictedAt: null,
    publishedApproximate: null,
    travelS: 600,
    distanceM: 4700,
    waitS: 0,
    lateS: 0,
    windowStartAt: new Date('2026-11-05T21:00:00Z'),
    windowEndAt: new Date('2026-11-06T06:00:00Z'),
    windowTimezone: 'Australia/Sydney',
    durationMinutes: 45,
    lat: -33.8836,
    lng: 151.2108,
    manual: false,
    executed: false,
    approximate: false,
    missingCoordinates: false,
    ...over,
  };
}

function planInput(over: Partial<SaveDayPlanInput> = {}): SaveDayPlanInput {
  return {
    id: null,
    expectedVersion: null,
    inspectorId: seed.inspectorId,
    planDate: '2026-11-05',
    timezone: 'Australia/Sydney',
    status: 'PUBLISHED',
    inputFingerprint: 'fp-1',
    publishedAt: new Date('2026-11-04T08:30:00Z'),
    notifiedAt: null,
    computedAt: new Date('2026-11-04T08:30:00Z'),
    computedByUserId: null,
    lastTrigger: 'SCHEDULED_PUBLISH',
    originSource: 'BASE',
    originLat: -33.87,
    originLng: 151.2,
    originOverride: null,
    originOverrideLat: null,
    originOverrideLng: null,
    originOverrideSetAt: null,
    departureAt: new Date('2026-11-04T20:50:00Z'),
    finishEta: new Date('2026-11-04T23:35:00Z'),
    totalDriveS: 600,
    totalWaitS: 0,
    totalServiceS: 2700,
    totalLateS: 0,
    totalDistanceM: 4700,
    feasible: true,
    manualOrder: false,
    suggestedOrder: [seed.apptA, seed.apptB],
    weights: { travel: 1, windowWait: 1, baseProximity: 1 },
    optimizerMethod: 'EXACT',
    routingProvider: 'STUB',
    matrixProfile: 'haversine',
    approximate: true,
    approximateReason: 'NO_PROVIDER',
    routeGeometry: { type: 'FeatureCollection', features: [] },
    routingMatrix: { provider: 'STUB', profile: 'haversine', points: [], travelS: [] },
    legTravel: [{ fromKey: 'origin', toKey: seed.apptA, travelS: 600 }],
    stops: [stop(seed.apptA, 1), stop(seed.apptB, 2)],
    ...over,
  };
}

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaDayPlanRepository(harness.prisma);

  const tenant = await harness.prisma.tenant.create({ data: { name: 'DP-T', legal_name: 'DP LLC', status: 'ACTIVE' } });
  const branch = await harness.prisma.branch.create({ data: { tenant_id: tenant.id, name: 'DP-B', status: 'ACTIVE' } });
  const user = await harness.prisma.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, role: 'CL_ADMIN', name: 'DP-U',
      email: `dp-${randomUUID().slice(0, 8)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  seed.userId = user.id;
  const inspector = await harness.prisma.inspector.create({
    data: { name: 'DP Inspector', email: `dp-insp-${randomUUID().slice(0, 8)}@test.local`, status: 'ACTIVE' },
  });
  seed.inspectorId = inspector.id;
  const serviceType = await harness.prisma.serviceType.create({
    data: { code: `DP-ST-${randomUUID().slice(0, 6)}`, name: 'Routine', flow_type: 'ROUTINE', requires_rental_tenant_confirmation: false, status: 'ACTIVE' },
  });
  const property = await harness.prisma.property.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, property_code: `DP-${randomUUID().slice(0, 6)}`,
      type: 'HOUSE', street: '12 King St', suburb: 'Surry Hills', postcode: '2010', state: 'NSW', country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  for (const key of ['apptA', 'apptB'] as const) {
    const appt = await harness.prisma.appointment.create({
      data: {
        tenant_id: tenant.id, branch_id: branch.id, property_id: property.id, service_type_id: serviceType.id,
        inspector_id: inspector.id, status: 'SCHEDULED', scheduled_date: new Date('2026-11-05'),
        time_slot_start: '08:00', time_slot_end: '17:00', price_amount: '100.00', payout_amount: '80.00',
        pricing_rule_snapshot_json: {}, rental_tenant_confirmation_status: 'CONFIRMED', created_by_user_id: user.id,
      },
    });
    seed[key] = appt.id;
  }
}, 120_000);

afterAll(async () => { await teardownDbHarness(harness); });

describe('PrismaDayPlanRepository (real DB)', () => {
  it('inserts a plan at version 1 with its stops and reloads it', async () => {
    const saved = await repo.saveComputed(planInput());
    expect(saved).not.toBeNull();
    expect(saved!.version).toBe(1);
    expect(saved!.stops.map((s) => s.appointmentId)).toEqual([seed.apptA, seed.apptB]);
    expect(saved!.approximateReason).toBe('NO_PROVIDER');
    expect(saved!.originLat).toBeCloseTo(-33.87, 5);
  });

  it('CAS-updates with the correct version and rejects a stale version', async () => {
    const current = await repo.findByInspectorAndDate(seed.inspectorId, '2026-11-05');
    const ok = await repo.saveComputed(planInput({ id: current!.id, expectedVersion: current!.version, inputFingerprint: 'fp-2' }));
    expect(ok).not.toBeNull();
    expect(ok!.version).toBe(current!.version + 1);
    expect(ok!.inputFingerprint).toBe('fp-2');

    const stale = await repo.saveComputed(planInput({ id: current!.id, expectedVersion: current!.version }));
    expect(stale).toBeNull(); // CAS lost
  });

  it('drops a stop whose appointment left SCHEDULED/DONE (L-F04-04 status join)', async () => {
    await harness.prisma.appointment.update({ where: { id: seed.apptB }, data: { status: 'DRAFT' } });
    const plan = await repo.findByInspectorAndDate(seed.inspectorId, '2026-11-05');
    expect(plan!.stops.map((s) => s.appointmentId)).toEqual([seed.apptA]);
    await harness.prisma.appointment.update({ where: { id: seed.apptB }, data: { status: 'SCHEDULED' } });
  });

  it('marks a PUBLISHED today plan STALE idempotently', async () => {
    const today = todayCivilSydney();
    const created = await repo.saveComputed(planInput({ planDate: today, suggestedOrder: [seed.apptA] , stops: [stop(seed.apptA, 1)] }));
    const first = await repo.markStaleByAppointmentIds([seed.apptA], 'APPOINTMENT_STATUS_CHANGED');
    expect(first).toBeGreaterThanOrEqual(1);
    const reloaded = await repo.findByInspectorAndDate(seed.inspectorId, today);
    expect(reloaded!.status).toBe('STALE');
    expect(reloaded!.version).toBe(created!.version + 1);
    const second = await repo.markStaleByAppointmentIds([seed.apptA], 'INSPECTOR_CANT_DO');
    expect(second).toBe(0); // already STALE → no re-increment, first reason wins
    const after = await repo.findByInspectorAndDate(seed.inspectorId, today);
    expect(after!.staleReason).toBe('APPOINTMENT_STATUS_CHANGED');
  });

  it('purges route data of past plans only', async () => {
    // A genuinely past-dated plan with stored geometry/matrix.
    await repo.saveComputed(planInput({ planDate: '2020-01-01', suggestedOrder: [seed.apptA], stops: [stop(seed.apptA, 1)] }));
    const touched = await repo.purgePastRouteData(todayCivilSydney());
    expect(touched).toBeGreaterThanOrEqual(1);
    const past = await repo.findByInspectorAndDate(seed.inspectorId, '2020-01-01');
    expect(past!.routeGeometry).toBeNull();
    expect(past!.routingMatrix).toBeNull();
    expect(past!.geometryPurgedAt).not.toBeNull();
    // A future plan keeps its geometry.
    const future = await repo.findByInspectorAndDate(seed.inspectorId, '2026-11-05');
    expect(future!.routeGeometry).not.toBeNull();
  });
});
