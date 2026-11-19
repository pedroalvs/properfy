/**
 * Real-Postgres test for the day-plan repository SQL surface a mock cannot
 * validate: optimistic CAS on `saveComputed`, the L-F04-04 status-join filter,
 * the timezone-correct STALE marking, and the no-routing-result-persistence guarantee.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaDayPlanRepository } from '../../../src/modules/day-plan/infrastructure/prisma-day-plan.repository';
import type { SaveDayPlanInput, SaveDayPlanStop } from '../../../src/modules/day-plan/domain/day-plan.repository';

let harness: DbHarness;
let repo: PrismaDayPlanRepository;

const seed = { inspectorId: '', apptA: '', apptB: '', userId: '', tenantId: '' };

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
    stops: [stop(seed.apptA, 1), stop(seed.apptB, 2)],
    ...over,
  };
}

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaDayPlanRepository(harness.prisma);

  const tenant = await harness.prisma.tenant.create({ data: { name: 'DP-T', legal_name: 'DP LLC', status: 'ACTIVE' } });
  seed.tenantId = tenant.id;
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

  it('derives the publish due set from day-plan.publish claims (§6)', async () => {
    // Ensure a clean, PUBLISHED-but-not-notified plan exists for 2026-11-05.
    const existing = await repo.findByInspectorAndDate(seed.inspectorId, '2026-11-05');
    await repo.saveComputed(
      planInput({ id: existing!.id, expectedVersion: existing!.version, notifiedAt: null, status: 'PUBLISHED' }),
    );

    // No claim yet → nothing due.
    expect(await repo.loadPublishDue()).toEqual([]);

    // Claim day-plan.publish for the agency's 2026-11-04 → plan_date 2026-11-05 becomes due.
    await harness.prisma.cronJobRun.create({
      data: { job_name: 'day-plan.publish', tenant_id: seed.tenantId, local_date: new Date('2026-11-04') },
    });
    const due = await repo.loadPublishDue();
    expect(due).toContainEqual({ inspectorId: seed.inspectorId, date: '2026-11-05' });

    // Once the plan is published AND notified, it drops out (condition c).
    const toNotify = await repo.findByInspectorAndDate(seed.inspectorId, '2026-11-05');
    await repo.markNotified(toNotify!.id);
    const dueAfter = await repo.loadPublishDue();
    expect(dueAfter.some((d) => d.inspectorId === seed.inspectorId && d.date === '2026-11-05')).toBe(false);

    // Cleanup so later assertions about 2026-11-05 see a pristine plan state.
    await harness.prisma.cronJobRun.deleteMany({ where: { job_name: 'day-plan.publish' } });
  });

  it('persists and reads a plan without the dropped routing columns (Plan B contract phase)', async () => {
    await repo.saveComputed(planInput({ planDate: '2020-01-01', suggestedOrder: [seed.apptA], stops: [stop(seed.apptA, 1)] }));
    const cols = await harness.prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'day_plans'
        AND column_name IN ('route_geometry', 'routing_matrix_json', 'leg_travel_json', 'geometry_purged_at')`;
    expect(cols).toEqual([]);
    const read = await repo.findByInspectorAndDate(seed.inspectorId, '2020-01-01');
    expect(read!.stops).toHaveLength(1);
  });

  // Test 28 (L-F04-15 / FR-014): the metric query measures |check-in − frozen
  // published start| and honours the status join + approximate/abandoned exclusion.
  it('returns ETA-accuracy samples from the frozen published start', async () => {
    const publishedStart = new Date('2026-11-10T21:00:00Z');
    const predictedAt = new Date('2026-11-10T20:00:00Z'); // before the check-in
    await repo.saveComputed(
      planInput({
        planDate: '2026-11-10',
        suggestedOrder: [seed.apptA],
        stops: [
          stop(seed.apptA, 1, {
            publishedServiceStartAt: publishedStart,
            publishedPredictedAt: predictedAt,
            publishedApproximate: false,
          }),
        ],
      }),
    );
    // Check-in 5 minutes after the published start.
    await harness.prisma.inspectionExecution.upsert({
      where: { appointment_id: seed.apptA },
      create: {
        appointment_id: seed.apptA,
        inspector_id: seed.inspectorId,
        started_at: new Date('2026-11-10T21:05:00Z'),
        start_latitude: '-33.8836',
        start_longitude: '151.2108',
      },
      update: { started_at: new Date('2026-11-10T21:05:00Z'), abandoned_at: null },
    });

    const samples = await repo.getEtaAccuracySamples('2026-11-10', '2026-11-10');
    expect(samples).toHaveLength(1);
    expect(samples[0]!.errorMinutes).toBeCloseTo(5, 5);

    // An approximate published prediction is excluded.
    await harness.prisma.$executeRaw`
      UPDATE "day_plan_stops" SET "published_approximate" = true
      WHERE "appointment_id" = ${seed.apptA}::text AND "published_service_start_at" IS NOT NULL`;
    expect(await repo.getEtaAccuracySamples('2026-11-10', '2026-11-10')).toHaveLength(0);
  });
});
