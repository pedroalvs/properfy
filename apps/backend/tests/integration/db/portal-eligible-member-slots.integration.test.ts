/**
 * Real-database tests for tenant portal eligible member appointment slots.
 *
 * The portal eligibility rule remains group-level proximity (at least one group
 * appointment within 2 km of the portal appointment's property), but the
 * selectable rows are future member appointment slots.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedInspector, seedTenant } from '../service-region/helpers/service-region-fixtures';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';

let harness: DbHarness;
let repo: PrismaServiceGroupRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaServiceGroupRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE appointments, service_groups, properties, service_types, inspectors, users, branches, tenants CASCADE`,
  );
});

const TODAY = new Date('2026-07-02T00:00:00.000Z');
const GROUP_DATE = new Date('2026-08-01T00:00:00.000Z');
const SLOT_ONE_DATE = new Date('2026-08-03T00:00:00.000Z');
const SLOT_TWO_DATE = new Date('2026-08-04T00:00:00.000Z');
const PAST_DATE = new Date('2026-07-01T00:00:00.000Z');

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
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `PORTAL-SLOTS-${suffix}`,
      name: `Routine ${suffix}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  return serviceType.id;
}

async function seedPropertyPoint(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    branchId: string;
    suburb: string;
    lat: number;
    lng: number;
  },
): Promise<string> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO properties (id, tenant_id, branch_id, property_code, type, street, suburb, postcode, state, country, geocoding_status, coordinates, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      ${params.tenantId},
      ${params.branchId},
      ${'P-' + rand()},
      'HOUSE',
      '1 Test St',
      ${params.suburb},
      '2000',
      'NSW',
      'AU',
      'SUCCESS',
      ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326),
      NOW(),
      NOW()
    )
    RETURNING id
  `;
  return rows[0]!.id;
}

async function seedAcceptedGroup(
  prisma: PrismaClient,
  params: {
    serviceTypeId: string;
    createdByUserId: string;
    inspectorId: string;
    confirmedCount?: number;
  },
): Promise<string> {
  const group = await prisma.serviceGroup.create({
    data: {
      service_type_id: params.serviceTypeId,
      status: 'ACCEPTED',
      group_size: 10,
      offered_count: 3,
      confirmed_count: params.confirmedCount ?? 3,
      scheduled_date: GROUP_DATE,
      time_window: '08:00-17:00',
      priority_mode: 'STANDARD',
      assigned_inspector_id: params.inspectorId,
      assigned_at: new Date(),
      created_by_user_id: params.createdByUserId,
    },
  });
  return group.id;
}

async function seedAppointment(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    branchId: string;
    propertyId: string;
    serviceTypeId: string;
    createdByUserId: string;
    groupId: string;
    scheduledDate: Date;
    timeSlotStart: string;
    timeSlotEnd: string;
    deleted?: boolean;
  },
): Promise<string> {
  const appointment = await prisma.appointment.create({
    data: {
      tenant_id: params.tenantId,
      branch_id: params.branchId,
      property_id: params.propertyId,
      service_type_id: params.serviceTypeId,
      service_group_id: params.groupId,
      status: 'SCHEDULED',
      scheduled_date: params.scheduledDate,
      time_slot_start: params.timeSlotStart,
      time_slot_end: params.timeSlotEnd,
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      created_by_user_id: params.createdByUserId,
      deleted_at: params.deleted ? new Date() : null,
    },
  });
  return appointment.id;
}

describe('PrismaServiceGroupRepository portal member slots — real DB', () => {
  it('returns distinct future member slots for groups that satisfy the existing 2 km eligibility rule', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Portal Slots Agency');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const { inspectorId } = await seedInspector(harness.prisma, 'Slot Inspector');

    const portalPropertyId = await seedPropertyPoint(harness.prisma, {
      tenantId,
      branchId,
      suburb: 'Portal Home',
      lat: -33.865,
      lng: 151.209,
    });
    const nearPropertyId = await seedPropertyPoint(harness.prisma, {
      tenantId,
      branchId,
      suburb: 'Near Slot',
      lat: -33.866,
      lng: 151.210,
    });
    const farPropertyId = await seedPropertyPoint(harness.prisma, {
      tenantId,
      branchId,
      suburb: 'Far Slot',
      lat: -33.965,
      lng: 151.309,
    });
    const {
      tenantId: foreignTenantId,
      userId: foreignUserId,
    } = await seedTenant(harness.prisma, 'Foreign Portal Slots Agency');
    const foreignBranchId = await getBranchId(harness.prisma, foreignTenantId);
    const foreignNearPropertyId = await seedPropertyPoint(harness.prisma, {
      tenantId: foreignTenantId,
      branchId: foreignBranchId,
      suburb: 'Foreign Near Slot',
      lat: -33.866,
      lng: 151.210,
    });

    const eligibleGroupId = await seedAcceptedGroup(harness.prisma, {
      serviceTypeId,
      createdByUserId: userId,
      inspectorId,
    });
    await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId: nearPropertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId: eligibleGroupId,
      scheduledDate: SLOT_ONE_DATE,
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
    });
    await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId: nearPropertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId: eligibleGroupId,
      scheduledDate: SLOT_ONE_DATE,
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
    });
    await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId: farPropertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId: eligibleGroupId,
      scheduledDate: SLOT_TWO_DATE,
      timeSlotStart: '13:00',
      timeSlotEnd: '14:00',
    });
    await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId: nearPropertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId: eligibleGroupId,
      scheduledDate: PAST_DATE,
      timeSlotStart: '15:00',
      timeSlotEnd: '16:00',
    });
    await seedAppointment(harness.prisma, {
      tenantId: foreignTenantId,
      branchId: foreignBranchId,
      propertyId: foreignNearPropertyId,
      serviceTypeId,
      createdByUserId: foreignUserId,
      groupId: eligibleGroupId,
      scheduledDate: SLOT_TWO_DATE,
      timeSlotStart: '16:00',
      timeSlotEnd: '17:00',
    });

    const farOnlyGroupId = await seedAcceptedGroup(harness.prisma, {
      serviceTypeId,
      createdByUserId: userId,
      inspectorId,
    });
    await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId: farPropertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId: farOnlyGroupId,
      scheduledDate: SLOT_ONE_DATE,
      timeSlotStart: '11:00',
      timeSlotEnd: '12:00',
    });
    const foreignGroupId = await seedAcceptedGroup(harness.prisma, {
      serviceTypeId,
      createdByUserId: foreignUserId,
      inspectorId,
    });
    await seedAppointment(harness.prisma, {
      tenantId: foreignTenantId,
      branchId: foreignBranchId,
      propertyId: foreignNearPropertyId,
      serviceTypeId,
      createdByUserId: foreignUserId,
      groupId: foreignGroupId,
      scheduledDate: SLOT_ONE_DATE,
      timeSlotStart: '17:00',
      timeSlotEnd: '18:00',
    });

    const slots = await repo.findPortalEligibleSlots({
      tenantId,
      serviceTypeId,
      propertyId: portalPropertyId,
      today: TODAY,
    });

    expect(slots.map((slot) => ({
      groupId: slot.groupId,
      scheduledDate: slot.scheduledDate.toISOString().slice(0, 10),
      timeSlotStart: slot.timeSlotStart,
      timeSlotEnd: slot.timeSlotEnd,
    }))).toEqual([
      {
        groupId: eligibleGroupId,
        scheduledDate: '2026-08-03',
        timeSlotStart: '09:00',
        timeSlotEnd: '10:00',
      },
      {
        groupId: eligibleGroupId,
        scheduledDate: '2026-08-04',
        timeSlotStart: '13:00',
        timeSlotEnd: '14:00',
      },
    ]);
    expect(slots.every((slot) => slot.groupId !== farOnlyGroupId)).toBe(true);
    expect(slots.every((slot) => slot.groupId !== foreignGroupId)).toBe(true);
    expect(slots.some((slot) => (
      slot.groupId === eligibleGroupId &&
      slot.scheduledDate.toISOString().slice(0, 10) === '2026-08-04' &&
      slot.timeSlotStart === '16:00' &&
      slot.timeSlotEnd === '17:00'
    ))).toBe(false);
    expect(slots[0]!.inspectorName).toBe('Slot Inspector');
    expect(slots[0]!.confirmedCount).toBe(3);
    expect(slots[0]!.capacityMax).toBe(10);
  });

  it('validates selected slots only when a matching non-deleted future member appointment exists', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Portal Slot Validation Agency');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const { inspectorId } = await seedInspector(harness.prisma, 'Validation Inspector');
    const propertyId = await seedPropertyPoint(harness.prisma, {
      tenantId,
      branchId,
      suburb: 'Validation Slot',
      lat: -33.865,
      lng: 151.209,
    });
    const groupId = await seedAcceptedGroup(harness.prisma, {
      serviceTypeId,
      createdByUserId: userId,
      inspectorId,
    });

    await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId,
      scheduledDate: SLOT_ONE_DATE,
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
    });
    await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId,
      scheduledDate: SLOT_TWO_DATE,
      timeSlotStart: '11:00',
      timeSlotEnd: '12:00',
      deleted: true,
    });
    await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId,
      scheduledDate: PAST_DATE,
      timeSlotStart: '13:00',
      timeSlotEnd: '14:00',
    });

    await expect(repo.hasPortalMemberSlot({
      groupId,
      scheduledDate: '2026-08-03',
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
      today: TODAY,
    })).resolves.toBe(true);

    await expect(repo.hasPortalMemberSlot({
      groupId,
      scheduledDate: '2026-08-04',
      timeSlotStart: '11:00',
      timeSlotEnd: '12:00',
      today: TODAY,
    })).resolves.toBe(false);

    await expect(repo.hasPortalMemberSlot({
      groupId,
      scheduledDate: '2026-07-01',
      timeSlotStart: '13:00',
      timeSlotEnd: '14:00',
      today: TODAY,
    })).resolves.toBe(false);
  });
});
