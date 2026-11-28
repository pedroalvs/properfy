/**
 * Move appointments between service groups — real-database verification.
 *
 * `moveAppointmentBetweenGroups` relinks a member and reconciles status +
 * `confirmed_count` on BOTH groups inside one transaction. A mock cannot prove the
 * atomic SQL, the FK-scoped writes or the counter arithmetic, so this exercises it
 * on PostgreSQL. `findMoveTargetsForAppointments` is checked for the source-exclusion
 * and lower-bound-date filters.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { futureDateStr, pastDateStr } from '../../helpers/date-fixtures';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../src/shared/domain/timezone-date';

const rand = () => Math.random().toString(36).slice(2, 10);

interface Fixture {
  tenantId: string;
  branchId: string;
  userId: string;
  propertyId: string;
}

async function seedTenant(prisma: PrismaClient): Promise<Fixture> {
  const suffix = rand();
  const tenant = await prisma.tenant.create({ data: { name: `MG ${suffix}`, legal_name: `MG ${suffix} LLC`, status: 'ACTIVE' } });
  const branch = await prisma.branch.create({ data: { tenant_id: tenant.id, name: 'MG Branch', status: 'ACTIVE' } });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, role: 'OP', name: 'MG Actor',
      email: `mg-${suffix}@test.local`, password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, property_code: `MG-${suffix}`, type: 'HOUSE',
      street: '1 Test St', suburb: 'Test', postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS',
    },
  });
  return { tenantId: tenant.id, branchId: branch.id, userId: user.id, propertyId: property.id };
}

async function seedGroup(
  prisma: PrismaClient,
  fx: Fixture,
  serviceTypeId: string,
  status: 'DRAFT' | 'PUBLISHED' | 'ACCEPTED' | 'CANCELLED',
  scheduledDate: string,
  opts: { inspectorId?: string; confirmedCount?: number } = {},
): Promise<string> {
  const g = await prisma.serviceGroup.create({
    data: {
      service_type_id: serviceTypeId,
      status,
      scheduled_date: new Date(scheduledDate),
      time_window: '09:00-12:00',
      created_by_user_id: fx.userId,
      assigned_inspector_id: opts.inspectorId ?? null,
      confirmed_count: opts.confirmedCount ?? 0,
    },
  });
  return g.id;
}

async function seedMember(
  prisma: PrismaClient,
  fx: Fixture,
  serviceTypeId: string,
  groupId: string,
  status: 'AWAITING_INSPECTOR' | 'SCHEDULED',
  inspectorId: string | null,
  scheduledDate: string,
): Promise<string> {
  const a = await prisma.appointment.create({
    data: {
      tenant_id: fx.tenantId, branch_id: fx.branchId, property_id: fx.propertyId,
      service_type_id: serviceTypeId, service_group_id: groupId, inspector_id: inspectorId,
      status, scheduled_date: new Date(scheduledDate), time_slot_start: '09:00', time_slot_end: '10:00',
      price_amount: '100.00', payout_amount: '80.00', pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING', created_by_user_id: fx.userId,
    },
  });
  return a.id;
}

describe('moveAppointmentBetweenGroups (real DB)', () => {
  let harness: DbHarness | undefined;
  let prisma: PrismaClient;
  let repo: PrismaServiceGroupRepository;
  let fx: Fixture;
  let serviceTypeId: string;
  let inspectorId: string;

  const FUTURE = futureDateStr(20);
  const FUTURE_2 = futureDateStr(30);

  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;
    repo = new PrismaServiceGroupRepository(prisma);
    fx = await seedTenant(prisma);
    const st = await prisma.serviceType.create({
      data: { code: `MG-ST-${rand()}`, name: 'MG Routine', flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE' },
    });
    serviceTypeId = st.id;
    const insp = await prisma.inspector.create({
      data: { name: 'MG Insp', email: `mg-insp-${rand()}@test.local`, status: 'ACTIVE', service_types_json: [], blocked_clients_json: [] },
    });
    inspectorId = insp.id;
  }, 120_000);

  afterAll(async () => {
    if (harness) await teardownDbHarness(harness);
  });

  it('moves a SCHEDULED member between two ACCEPTED groups, adjusting both confirmed_counts', async () => {
    const source = await seedGroup(prisma, fx, serviceTypeId, 'ACCEPTED', FUTURE, { inspectorId, confirmedCount: 1 });
    const target = await seedGroup(prisma, fx, serviceTypeId, 'ACCEPTED', FUTURE_2, { inspectorId, confirmedCount: 0 });
    const apptId = await seedMember(prisma, fx, serviceTypeId, source, 'SCHEDULED', inspectorId, FUTURE);

    const outcome = await repo.moveAppointmentBetweenGroups({
      appointmentId: apptId, fromGroupId: source, toGroupId: target, expectedTargetInspectorId: inspectorId,
    });

    expect(outcome).toBe('MOVED_SCHEDULED');
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId } });
    expect(appt.service_group_id).toBe(target);
    expect(appt.status).toBe('SCHEDULED');
    expect(appt.inspector_id).toBe(inspectorId);
    const [src, tgt] = await Promise.all([
      prisma.serviceGroup.findUniqueOrThrow({ where: { id: source } }),
      prisma.serviceGroup.findUniqueOrThrow({ where: { id: target } }),
    ]);
    expect(src.confirmed_count).toBe(0);
    expect(tgt.confirmed_count).toBe(1);
  });

  it('decrements the source confirmed_count when a SCHEDULED member leaves an ACCEPTED source for a PUBLISHED target', async () => {
    const source = await seedGroup(prisma, fx, serviceTypeId, 'ACCEPTED', FUTURE, { inspectorId, confirmedCount: 1 });
    const target = await seedGroup(prisma, fx, serviceTypeId, 'PUBLISHED', FUTURE_2);
    const apptId = await seedMember(prisma, fx, serviceTypeId, source, 'SCHEDULED', inspectorId, FUTURE);

    const outcome = await repo.moveAppointmentBetweenGroups({
      appointmentId: apptId, fromGroupId: source, toGroupId: target, expectedTargetInspectorId: null,
    });

    expect(outcome).toBe('MOVED_AWAITING');
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId } });
    expect(appt.service_group_id).toBe(target);
    expect(appt.status).toBe('AWAITING_INSPECTOR');
    expect(appt.inspector_id).toBeNull();
    const [src, tgt] = await Promise.all([
      prisma.serviceGroup.findUniqueOrThrow({ where: { id: source } }),
      prisma.serviceGroup.findUniqueOrThrow({ where: { id: target } }),
    ]);
    expect(src.confirmed_count).toBe(0); // decremented when leaving the ACCEPTED source
    expect(tgt.confirmed_count).toBe(0); // a PUBLISHED target never increments
  });

  it('moves an AWAITING member into a PUBLISHED group (stays AWAITING, inspector cleared)', async () => {
    const source = await seedGroup(prisma, fx, serviceTypeId, 'PUBLISHED', FUTURE);
    const target = await seedGroup(prisma, fx, serviceTypeId, 'PUBLISHED', FUTURE_2);
    const apptId = await seedMember(prisma, fx, serviceTypeId, source, 'AWAITING_INSPECTOR', null, FUTURE);

    const outcome = await repo.moveAppointmentBetweenGroups({
      appointmentId: apptId, fromGroupId: source, toGroupId: target, expectedTargetInspectorId: null,
    });

    expect(outcome).toBe('MOVED_AWAITING');
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId } });
    expect(appt.service_group_id).toBe(target);
    expect(appt.status).toBe('AWAITING_INSPECTOR');
    expect(appt.inspector_id).toBeNull();
  });

  it('schedules the member when the target is ACCEPTED (AWAITING → SCHEDULED)', async () => {
    const source = await seedGroup(prisma, fx, serviceTypeId, 'PUBLISHED', FUTURE);
    const target = await seedGroup(prisma, fx, serviceTypeId, 'ACCEPTED', FUTURE_2, { inspectorId, confirmedCount: 0 });
    const apptId = await seedMember(prisma, fx, serviceTypeId, source, 'AWAITING_INSPECTOR', null, FUTURE);

    const outcome = await repo.moveAppointmentBetweenGroups({
      appointmentId: apptId, fromGroupId: source, toGroupId: target, expectedTargetInspectorId: inspectorId,
    });

    expect(outcome).toBe('MOVED_SCHEDULED');
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId } });
    expect(appt.status).toBe('SCHEDULED');
    expect(appt.inspector_id).toBe(inspectorId);
    const tgt = await prisma.serviceGroup.findUniqueOrThrow({ where: { id: target } });
    expect(tgt.confirmed_count).toBe(1);
  });

  it('returns GROUP_CHANGED when the target is terminal and writes nothing', async () => {
    const source = await seedGroup(prisma, fx, serviceTypeId, 'PUBLISHED', FUTURE);
    const target = await seedGroup(prisma, fx, serviceTypeId, 'CANCELLED', FUTURE_2);
    const apptId = await seedMember(prisma, fx, serviceTypeId, source, 'AWAITING_INSPECTOR', null, FUTURE);

    const outcome = await repo.moveAppointmentBetweenGroups({
      appointmentId: apptId, fromGroupId: source, toGroupId: target, expectedTargetInspectorId: null,
    });

    expect(outcome).toBe('GROUP_CHANGED');
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId } });
    expect(appt.service_group_id).toBe(source);
  });

  it('returns APPOINTMENT_CONFLICT when the appointment is not in the source group', async () => {
    const source = await seedGroup(prisma, fx, serviceTypeId, 'PUBLISHED', FUTURE);
    const other = await seedGroup(prisma, fx, serviceTypeId, 'PUBLISHED', FUTURE);
    const target = await seedGroup(prisma, fx, serviceTypeId, 'PUBLISHED', FUTURE_2);
    const apptId = await seedMember(prisma, fx, serviceTypeId, other, 'AWAITING_INSPECTOR', null, FUTURE);

    const outcome = await repo.moveAppointmentBetweenGroups({
      appointmentId: apptId, fromGroupId: source, toGroupId: target, expectedTargetInspectorId: null,
    });

    expect(outcome).toBe('APPOINTMENT_CONFLICT');
  });
});

describe('findMoveTargetsForAppointments (real DB)', () => {
  let harness: DbHarness | undefined;
  let prisma: PrismaClient;
  let repo: PrismaServiceGroupRepository;
  let fx: Fixture;
  let serviceTypeId: string;

  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;
    repo = new PrismaServiceGroupRepository(prisma);
    fx = await seedTenant(prisma);
    const st = await prisma.serviceType.create({
      data: { code: `MGF-ST-${rand()}`, name: 'MGF Routine', flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE' },
    });
    serviceTypeId = st.id;
  }, 120_000);

  afterAll(async () => {
    if (harness) await teardownDbHarness(harness);
  });

  it('excludes the source group and past-dated groups, includes future ones', async () => {
    const today = civilDateInTimezone(new Date(), PLATFORM_TIMEZONE);
    const source = await seedGroup(prisma, fx, serviceTypeId, 'PUBLISHED', futureDateStr(10));
    const futureTarget = await seedGroup(prisma, fx, serviceTypeId, 'PUBLISHED', futureDateStr(15));
    const pastGroup = await seedGroup(prisma, fx, serviceTypeId, 'PUBLISHED', pastDateStr(5));
    // one member in the future target so currentSize is non-zero
    await seedMember(prisma, fx, serviceTypeId, futureTarget, 'AWAITING_INSPECTOR', null, futureDateStr(15));

    const results = await repo.findMoveTargetsForAppointments({
      serviceTypeId,
      batchSize: 1,
      lowerBoundDate: today,
      excludeGroupIds: [source],
    });

    const ids = results.map((g) => g.id);
    expect(ids).toContain(futureTarget);
    expect(ids).not.toContain(source);
    expect(ids).not.toContain(pastGroup);
    expect(results.find((g) => g.id === futureTarget)!.currentSize).toBe(1);
  });
});
