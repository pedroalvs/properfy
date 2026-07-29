/**
 * `assignInspectorToGroupAppointments` — real-database verification.
 *
 * The method's whole contract lives in two WHERE clauses, and a mock cannot
 * prove a WHERE clause: it reports success no matter what the filter says. Up
 * to now this method was covered only by argument-shape assertions, so a broken
 * `deleted_at` filter or status predicate would have passed every test.
 *
 * What is proved here against PostgreSQL:
 *   1. A SCHEDULED member changes hands WITHOUT changing status — reassigning an
 *      accepted group is SCHEDULED -> SCHEDULED, which is exactly why this cannot
 *      go through the appointment state machine.
 *   2. An AWAITING_INSPECTOR member is promoted to SCHEDULED and gets the inspector.
 *   3. A soft-deleted member is left alone. Soft-deleted rows keep their
 *      `service_group_id`, so without the filter a deleted appointment would be
 *      handed to the new inspector and counted as work they owe.
 *   4. The returned counts match the rows actually touched.
 *
 * Members are seeded across two agencies because groups are tenant-agnostic;
 * the method must move all of them regardless of who owns each appointment.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { futureDateStr } from '../../helpers/date-fixtures';

interface TenantFixture {
  tenantId: string;
  branchId: string;
  userId: string;
  propertyId: string;
}

async function seedTenant(prisma: PrismaClient, name: string): Promise<TenantFixture> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const tenant = await prisma.tenant.create({
    data: { name, legal_name: `${name} LLC ${suffix}`, status: 'ACTIVE' },
  });
  const branch = await prisma.branch.create({
    data: { tenant_id: tenant.id, name: `${name} Branch`, status: 'ACTIVE' },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      role: 'OP',
      name: `${name} Actor`,
      email: `gir-${suffix}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_code: `GIR-${suffix}`,
      type: 'HOUSE',
      street: '1 Test St',
      suburb: 'Test',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  return { tenantId: tenant.id, branchId: branch.id, userId: user.id, propertyId: property.id };
}

const GROUP_DATE = futureDateStr(30);

describe('assignInspectorToGroupAppointments (real DB)', () => {
  let harness: DbHarness | undefined;
  let prisma: PrismaClient;
  let repo: PrismaServiceGroupRepository;
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;
  let serviceTypeId: string;
  let oldInspectorId: string;
  let newInspectorId: string;

  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;
    repo = new PrismaServiceGroupRepository(prisma);

    tenantA = await seedTenant(prisma, 'GIR Tenant A');
    tenantB = await seedTenant(prisma, 'GIR Tenant B');

    const suffix = Math.random().toString(36).slice(2, 10);
    const serviceType = await prisma.serviceType.create({
      data: {
        code: `GIR-ST-${suffix}`,
        name: `GIR Routine ${suffix}`,
        flow_type: 'ROUTINE',
        requires_rental_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });
    serviceTypeId = serviceType.id;

    const [oldInspector, newInspector] = await Promise.all([
      prisma.inspector.create({
        data: { name: 'Outgoing Inspector', email: `gir-old-${suffix}@test.local`, status: 'ACTIVE' },
      }),
      prisma.inspector.create({
        data: { name: 'Incoming Inspector', email: `gir-new-${suffix}@test.local`, status: 'ACTIVE' },
      }),
    ]);
    oldInspectorId = oldInspector.id;
    newInspectorId = newInspector.id;
  }, 180_000);

  afterAll(async () => {
    if (harness) await teardownDbHarness(harness);
  });

  async function seedGroup(): Promise<string> {
    const group = await prisma.serviceGroup.create({
      data: {
        service_type_id: serviceTypeId,
        status: 'ACCEPTED',
        scheduled_date: new Date(GROUP_DATE),
        time_window: '09:00-17:00',
        assigned_inspector_id: oldInspectorId,
        created_by_user_id: tenantA.userId,
      },
    });
    return group.id;
  }

  async function seedMember(
    fx: TenantFixture,
    groupId: string,
    status: 'SCHEDULED' | 'AWAITING_INSPECTOR',
    inspectorId: string | null,
  ): Promise<string> {
    const appt = await prisma.appointment.create({
      data: {
        tenant_id: fx.tenantId,
        branch_id: fx.branchId,
        property_id: fx.propertyId,
        service_type_id: serviceTypeId,
        service_group_id: groupId,
        status,
        inspector_id: inspectorId,
        scheduled_date: new Date(GROUP_DATE),
        time_slot_start: '10:00',
        time_slot_end: '11:00',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        rental_tenant_confirmation_status: 'PENDING',
        created_by_user_id: fx.userId,
      },
    });
    return appt.id;
  }

  it('swaps the inspector across a cross-agency group without disturbing status', async () => {
    const groupId = await seedGroup();
    const scheduledA = await seedMember(tenantA, groupId, 'SCHEDULED', oldInspectorId);
    const scheduledB = await seedMember(tenantB, groupId, 'SCHEDULED', oldInspectorId);

    const result = await repo.assignInspectorToGroupAppointments(groupId, newInspectorId);

    const [rowA, rowB] = await Promise.all([
      prisma.appointment.findUniqueOrThrow({ where: { id: scheduledA } }),
      prisma.appointment.findUniqueOrThrow({ where: { id: scheduledB } }),
    ]);

    expect(rowA.inspector_id).toBe(newInspectorId);
    expect(rowB.inspector_id).toBe(newInspectorId);
    // The state machine rejects SCHEDULED -> SCHEDULED, which is the whole
    // reason this is a bulk write instead of a transition.
    expect(rowA.status).toBe('SCHEDULED');
    expect(rowB.status).toBe('SCHEDULED');
    expect(result).toEqual({ reassigned: 2, scheduled: 0 });
  }, 60_000);

  it('promotes a member that was still waiting for an inspector', async () => {
    const groupId = await seedGroup();
    const waiting = await seedMember(tenantA, groupId, 'AWAITING_INSPECTOR', null);

    const result = await repo.assignInspectorToGroupAppointments(groupId, newInspectorId);

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: waiting } });
    expect(row.status).toBe('SCHEDULED');
    expect(row.inspector_id).toBe(newInspectorId);
    expect(result).toEqual({ reassigned: 0, scheduled: 1 });
  }, 60_000);

  it('never hands a soft-deleted member to the new inspector', async () => {
    const groupId = await seedGroup();
    const live = await seedMember(tenantA, groupId, 'SCHEDULED', oldInspectorId);
    const deleted = await seedMember(tenantB, groupId, 'SCHEDULED', oldInspectorId);
    // Soft delete keeps service_group_id, so the row stays in the group's
    // membership and only the deleted_at filter excludes it.
    await prisma.appointment.update({ where: { id: deleted }, data: { deleted_at: new Date() } });

    const result = await repo.assignInspectorToGroupAppointments(groupId, newInspectorId);

    const [liveRow, deletedRow] = await Promise.all([
      prisma.appointment.findUniqueOrThrow({ where: { id: live } }),
      prisma.appointment.findUniqueOrThrow({ where: { id: deleted } }),
    ]);
    expect(liveRow.inspector_id).toBe(newInspectorId);
    expect(deletedRow.inspector_id).toBe(oldInspectorId);
    // Counting it would tell the inspector they owe work that no longer exists.
    expect(result).toEqual({ reassigned: 1, scheduled: 0 });
  }, 60_000);

  it('leaves members of other groups untouched', async () => {
    const groupId = await seedGroup();
    const otherGroupId = await seedGroup();
    const mine = await seedMember(tenantA, groupId, 'SCHEDULED', oldInspectorId);
    const theirs = await seedMember(tenantA, otherGroupId, 'SCHEDULED', oldInspectorId);

    await repo.assignInspectorToGroupAppointments(groupId, newInspectorId);

    const [mineRow, theirsRow] = await Promise.all([
      prisma.appointment.findUniqueOrThrow({ where: { id: mine } }),
      prisma.appointment.findUniqueOrThrow({ where: { id: theirs } }),
    ]);
    expect(mineRow.inspector_id).toBe(newInspectorId);
    expect(theirsRow.inspector_id).toBe(oldInspectorId);
  }, 60_000);
});
