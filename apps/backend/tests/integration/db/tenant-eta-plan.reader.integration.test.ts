/**
 * Real-DB coverage for the F06 tenant-ETA plan reader (FR-023). Proves the
 * cross-agency read (D9), the stopMeta confirmation columns (L-F06-02), the
 * abandoned-execution masking, and the agency-local-midnight late-notice filter.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaInspectorFieldEventRepository } from '../../../src/modules/inspector-execution/infrastructure/prisma-inspector-field-event.repository';
import { PrismaTenantEtaPlanReader } from '../../../src/modules/tenant-eta/infrastructure/prisma-tenant-eta-plan.reader';

let harness: DbHarness;
let reader: PrismaTenantEtaPlanReader;

const DATE = new Date('2026-11-05');
// Sydney AEDT (UTC+11) windows for 2026-11-05.
const WIN = {
  aStart: new Date('2026-11-04T21:00:00.000Z'),
  aEnd: new Date('2026-11-04T23:00:00.000Z'),
  bStart: new Date('2026-11-04T22:00:00.000Z'),
  bEnd: new Date('2026-11-05T01:00:00.000Z'),
};

const ctx = {
  tenantSydId: '',
  tenantPerId: '',
  inspectorId: '',
  userId: '',
  stId: '',
  stNoConfirmId: '',
  dayPlanId: '',
  apptA: '',
  apptB: '',
};

async function makeAppointment(opts: {
  tenantId: string;
  branchId: string;
  propertyId: string;
  serviceTypeId: string;
  confirmation?: 'PENDING' | 'CONFIRMED' | 'UNAVAILABLE' | 'NO_RESPONSE';
  keyRequired?: boolean;
  status?: 'SCHEDULED' | 'DONE';
}): Promise<string> {
  const appt = await harness.prisma.appointment.create({
    data: {
      tenant_id: opts.tenantId,
      branch_id: opts.branchId,
      property_id: opts.propertyId,
      service_type_id: opts.serviceTypeId,
      inspector_id: ctx.inspectorId,
      status: opts.status ?? 'SCHEDULED',
      scheduled_date: DATE,
      time_slot_start: '08:00',
      time_slot_end: '17:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: opts.confirmation ?? 'CONFIRMED',
      key_required: opts.keyRequired ?? false,
      created_by_user_id: ctx.userId,
    },
  });
  return appt.id;
}

beforeAll(async () => {
  harness = await setupDbHarness();
  reader = new PrismaTenantEtaPlanReader(
    harness.prisma,
    new PrismaInspectorFieldEventRepository(harness.prisma),
  );

  const tSyd = await harness.prisma.tenant.create({
    data: { name: 'Syd', legal_name: 'Syd LLC', status: 'ACTIVE', timezone: 'Australia/Sydney' },
  });
  ctx.tenantSydId = tSyd.id;
  const tPer = await harness.prisma.tenant.create({
    data: { name: 'Per', legal_name: 'Per LLC', status: 'ACTIVE', timezone: 'Australia/Perth' },
  });
  ctx.tenantPerId = tPer.id;
  const branchSyd = await harness.prisma.branch.create({ data: { tenant_id: tSyd.id, name: 'BS', status: 'ACTIVE' } });
  const branchPer = await harness.prisma.branch.create({ data: { tenant_id: tPer.id, name: 'BP', status: 'ACTIVE' } });
  const user = await harness.prisma.user.create({
    data: {
      tenant_id: tSyd.id, branch_id: branchSyd.id, role: 'CL_ADMIN', name: 'U',
      email: `u-${randomUUID().slice(0, 8)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  ctx.userId = user.id;
  const inspector = await harness.prisma.inspector.create({
    data: { name: 'Insp', email: `i-${randomUUID().slice(0, 8)}@test.local`, status: 'ACTIVE' },
  });
  ctx.inspectorId = inspector.id;
  const st = await harness.prisma.serviceType.create({
    data: { code: `ST-${randomUUID().slice(0, 6)}`, name: 'Routine', flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE' },
  });
  ctx.stId = st.id;
  const stNo = await harness.prisma.serviceType.create({
    data: { code: `STN-${randomUUID().slice(0, 6)}`, name: 'Ingoing', flow_type: 'INGOING', requires_rental_tenant_confirmation: false, status: 'ACTIVE' },
  });
  ctx.stNoConfirmId = stNo.id;
  const propSyd = await harness.prisma.property.create({
    data: { tenant_id: tSyd.id, branch_id: branchSyd.id, property_code: `P-${randomUUID().slice(0, 6)}`, type: 'HOUSE', street: '1 A St', suburb: 'Surry Hills', postcode: '2010', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS' },
  });
  const propPer = await harness.prisma.property.create({
    data: { tenant_id: tPer.id, branch_id: branchPer.id, property_code: `P-${randomUUID().slice(0, 6)}`, type: 'HOUSE', street: '2 B St', suburb: 'Perth', postcode: '6000', state: 'WA', country: 'AU', geocoding_status: 'SUCCESS' },
  });

  // A: Sydney, UNAVAILABLE + key required; B: Perth, CONFIRMED.
  ctx.apptA = await makeAppointment({ tenantId: tSyd.id, branchId: branchSyd.id, propertyId: propSyd.id, serviceTypeId: st.id, confirmation: 'UNAVAILABLE', keyRequired: true });
  ctx.apptB = await makeAppointment({ tenantId: tPer.id, branchId: branchPer.id, propertyId: propPer.id, serviceTypeId: stNo.id, confirmation: 'CONFIRMED' });

  const plan = await harness.prisma.dayPlan.create({
    data: {
      inspector_id: inspector.id,
      plan_date: DATE,
      timezone: 'Australia/Sydney',
      status: 'PUBLISHED',
      version: 1,
      input_fingerprint: 'fp-test',
      suggested_order_json: [],
      weights_json: { travel: 1, windowWait: 1, baseProximity: 1 },
      optimizer_method: 'FIXED',
      routing_provider: 'STUB',
      last_trigger: 'SCHEDULED_PUBLISH',
      computed_at: new Date(),
      published_at: new Date(),
      origin_source: 'BASE',
      departure_at: new Date('2026-11-04T20:40:00.000Z'),
      approximate: false,
      stops: {
        create: [
          { appointment_id: ctx.apptA, sequence: 1, travel_s: 1200, duration_minutes: 45, window_start_at: WIN.aStart, window_end_at: WIN.aEnd, window_timezone: 'Australia/Sydney', missing_coordinates: false, service_start_at: WIN.aStart, published_service_start_at: WIN.aStart },
          { appointment_id: ctx.apptB, sequence: 2, travel_s: 900, duration_minutes: 60, window_start_at: WIN.bStart, window_end_at: WIN.bEnd, window_timezone: 'Australia/Perth', missing_coordinates: false, service_start_at: WIN.bStart, published_service_start_at: WIN.bStart },
        ],
      },
    },
  });
  ctx.dayPlanId = plan.id;
}, 120_000);

afterAll(async () => { await teardownDbHarness(harness); });

describe('PrismaTenantEtaPlanReader (real DB)', () => {
  it('loadPlan returns stops in sequence with fields, two agencies present (D9)', async () => {
    const loaded = await reader.loadPlan(ctx.dayPlanId);
    expect(loaded).not.toBeNull();
    expect(loaded!.plan.stops.map((s) => s.appointmentId)).toEqual([ctx.apptA, ctx.apptB]);
    const [a, b] = loaded!.plan.stops;
    expect(a!.tenantId).toBe(ctx.tenantSydId);
    expect(b!.tenantId).toBe(ctx.tenantPerId);
    expect(a!.travelS).toBe(1200);
    expect(a!.durationMinutes).toBe(45);
    expect(a!.publishedServiceStartAt?.toISOString()).toBe(WIN.aStart.toISOString());
    expect(a!.scheduledDate).toBe('2026-11-05');
    expect(loaded!.plan.hasOrigin).toBe(true);
  });

  it('loadPlan exposes stopMeta confirmation columns (L-F06-02)', async () => {
    const loaded = await reader.loadPlan(ctx.dayPlanId);
    const a = loaded!.stopMeta.get(ctx.apptA)!;
    expect(a).toEqual({ rentalTenantConfirmationStatus: 'UNAVAILABLE', keyRequired: true, requiresRentalTenantConfirmation: true });
    const b = loaded!.stopMeta.get(ctx.apptB)!;
    expect(b.requiresRentalTenantConfirmation).toBe(false);
  });

  it('abandoned execution reports startedAt/finishedAt null and the stop stays PENDING-eligible', async () => {
    await harness.prisma.inspectionExecution.create({
      data: {
        appointment_id: ctx.apptA, inspector_id: ctx.inspectorId,
        started_at: new Date('2026-11-04T21:05:00.000Z'), abandoned_at: new Date('2026-11-04T21:30:00.000Z'),
        start_latitude: '-33.8700000', start_longitude: '151.2000000',
      },
    });
    const loaded = await reader.loadPlan(ctx.dayPlanId);
    expect(loaded!.events.executions.has(ctx.apptA)).toBe(false);
    await harness.prisma.inspectionExecution.delete({ where: { appointment_id: ctx.apptA } });
  });

  it('reassigned/deleted appointments drop out of the plan', async () => {
    await harness.prisma.appointment.update({ where: { id: ctx.apptB }, data: { deleted_at: new Date() } });
    const loaded = await reader.loadPlan(ctx.dayPlanId);
    expect(loaded!.plan.stops.map((s) => s.appointmentId)).toEqual([ctx.apptA]);
    await harness.prisma.appointment.update({ where: { id: ctx.apptB }, data: { deleted_at: null } });
  });

  it('keeps only today-after-midnight LATE_NOTICE, latest wins, ignores CANT_DO', async () => {
    // Yesterday (before Sydney midnight of 2026-11-05 = 2026-11-04T13:00Z) → ignored.
    await harness.prisma.inspectorFieldEvent.create({
      data: { appointment_id: ctx.apptA, inspector_id: ctx.inspectorId, tenant_id: ctx.tenantSydId, type: 'LATE_NOTICE', reason_code: 'TRAFFIC', minutes: 15, created_at: new Date('2026-11-04T12:59:00.000Z') },
    });
    // Two today → the later (60) wins.
    await harness.prisma.inspectorFieldEvent.create({
      data: { appointment_id: ctx.apptA, inspector_id: ctx.inspectorId, tenant_id: ctx.tenantSydId, type: 'LATE_NOTICE', reason_code: 'TRAFFIC', minutes: 20, created_at: new Date('2026-11-04T21:20:00.000Z') },
    });
    await harness.prisma.inspectorFieldEvent.create({
      data: { appointment_id: ctx.apptA, inspector_id: ctx.inspectorId, tenant_id: ctx.tenantSydId, type: 'LATE_NOTICE', reason_code: 'TRAFFIC', minutes: 60, created_at: new Date('2026-11-04T21:40:00.000Z') },
    });
    // A CANT_DO must not be read as a late notice.
    await harness.prisma.inspectorFieldEvent.create({
      data: { appointment_id: ctx.apptA, inspector_id: ctx.inspectorId, tenant_id: ctx.tenantSydId, type: 'CANT_DO', reason_code: 'NO_ACCESS', created_at: new Date('2026-11-04T21:45:00.000Z') },
    });
    const loaded = await reader.loadPlan(ctx.dayPlanId);
    const note = loaded!.events.lateNotices.get(ctx.apptA);
    expect(note?.minutesLate).toBe(60);
    await harness.prisma.inspectorFieldEvent.deleteMany({ where: { appointment_id: ctx.apptA } });
  });

  it('returns null for an unknown plan id', async () => {
    expect(await reader.loadPlan(randomUUID())).toBeNull();
  });

  it('findPlanByInspectorDate returns the plan with its live appointments in sequence', async () => {
    const ref = await reader.findPlanByInspectorDate(ctx.inspectorId, '2026-11-05');
    expect(ref?.dayPlanId).toBe(ctx.dayPlanId);
    expect(ref?.appointmentIds).toEqual([ctx.apptA, ctx.apptB]);
    expect(await reader.findPlanByInspectorDate(ctx.inspectorId, '2026-11-06')).toBeNull();
  });

  it('listSweepCandidates includes today published plans with a not-started SCHEDULED stop, excludes yesterday', async () => {
    const todaySyd = await reader.listSweepCandidates(new Date('2026-11-04T23:00:00.000Z')); // 10:00 Sydney 05/11
    expect(todaySyd.map((c) => c.dayPlanId)).toContain(ctx.dayPlanId);
    const yesterday = await reader.listSweepCandidates(new Date('2026-11-05T23:00:00.000Z')); // 06/11 Sydney
    expect(yesterday.map((c) => c.dayPlanId)).not.toContain(ctx.dayPlanId);
  });
});
