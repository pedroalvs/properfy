/**
 * Real-database test for the appointment-list → service-group join.
 *
 * `PrismaAppointmentRepository.findAll` joins `service_groups` to expose each
 * appointment's `serviceGroupNumber` (the sequential `group_number`), which the
 * list use-case formats into the `serviceGroupCode` shown in the map lasso
 * "Group" column. A linked appointment must carry its group's number; an
 * unlinked appointment must carry `null`.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend test:integration:db
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedTenant } from '../service-region/helpers/service-region-fixtures';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';

let harness: DbHarness;
let repo: PrismaAppointmentRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaAppointmentRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE appointments, service_groups, properties, service_types, users, branches, tenants CASCADE`,
  );
});

const PAGINATION = { page: 1, pageSize: 20, sortOrder: 'asc' as const };
const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function getBranchId(prisma: PrismaClient, tenantId: string): Promise<string> {
  const branch = await prisma.branch.findFirst({ where: { tenant_id: tenantId } });
  if (!branch) throw new Error('Branch not found for tenant');
  return branch.id;
}

async function seedServiceType(prisma: PrismaClient): Promise<string> {
  const suffix = rand();
  const st = await prisma.serviceType.create({
    data: {
      code: `ST-${suffix}`,
      name: `Routine ${suffix}`,
      flow_type: 'ROUTINE',
      requires_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  return st.id;
}

async function seedProperty(prisma: PrismaClient, tenantId: string, branchId: string): Promise<string> {
  const property = await prisma.property.create({
    data: {
      tenant_id: tenantId,
      branch_id: branchId,
      property_code: `P-${rand()}`,
      type: 'RESIDENTIAL',
      street: '1 Test St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
    },
  });
  return property.id;
}

/** Creates a service group and returns its auto-incremented group_number. */
async function seedGroup(prisma: PrismaClient, serviceTypeId: string, userId: string): Promise<{ id: string; groupNumber: number }> {
  const group = await prisma.serviceGroup.create({
    data: {
      service_type_id: serviceTypeId,
      status: 'DRAFT',
      group_size: 1,
      scheduled_date: FUTURE_DATE,
      time_window: '08:00-12:00',
      priority_mode: 'STANDARD',
      created_by_user_id: userId,
    },
  });
  return { id: group.id, groupNumber: group.group_number };
}

async function seedAppointment(
  prisma: PrismaClient,
  params: { tenantId: string; branchId: string; propertyId: string; serviceTypeId: string; userId: string; groupId?: string },
): Promise<string> {
  const appt = await prisma.appointment.create({
    data: {
      tenant_id: params.tenantId,
      branch_id: params.branchId,
      property_id: params.propertyId,
      service_type_id: params.serviceTypeId,
      status: 'DRAFT',
      scheduled_date: FUTURE_DATE,
      time_slot: 'MORNING',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      tenant_confirmation_status: 'PENDING',
      created_by_user_id: params.userId,
      ...(params.groupId ? { service_group_id: params.groupId } : {}),
    },
  });
  return appt.id;
}

describe('PrismaAppointmentRepository.findAll — service group join', () => {
  it('exposes the group_number as serviceGroupNumber for a grouped appointment and null for an ungrouped one', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const propertyId = await seedProperty(harness.prisma, tenantId, branchId);

    const group = await seedGroup(harness.prisma, serviceTypeId, userId);
    const groupedApptId = await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId, serviceTypeId, userId, groupId: group.id,
    });
    const ungroupedApptId = await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId, serviceTypeId, userId,
    });

    const items = await repo.findAll({ tenantId }, PAGINATION);

    const grouped = items.find((i) => i.appointment.id === groupedApptId);
    const ungrouped = items.find((i) => i.appointment.id === ungroupedApptId);

    expect(grouped?.serviceGroupNumber).toBe(group.groupNumber);
    expect(grouped?.appointment.serviceGroupId).toBe(group.id);
    expect(ungrouped?.serviceGroupNumber).toBeNull();
    expect(ungrouped?.appointment.serviceGroupId).toBeNull();
  });
});
