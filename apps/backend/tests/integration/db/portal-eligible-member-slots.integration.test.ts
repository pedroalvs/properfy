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
      offered_count: 3,
      confirmed_count: params.confirmedCount ?? 3,
      scheduled_date: GROUP_DATE,
      time_window: '08:00-17:00',
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
    groupId: string | null;
    scheduledDate: Date;
    timeSlotStart: string;
    timeSlotEnd: string;
    deleted?: boolean;
    status?: 'SCHEDULED' | 'CANCELLED' | 'REJECTED' | 'DRAFT';
  },
): Promise<string> {
  const appointment = await prisma.appointment.create({
    data: {
      tenant_id: params.tenantId,
      branch_id: params.branchId,
      property_id: params.propertyId,
      service_type_id: params.serviceTypeId,
      service_group_id: params.groupId,
      status: params.status ?? 'SCHEDULED',
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

    // One row per member appointment — including the duplicate 09:00-10:00 pair,
    // which the old per-slot GROUP BY used to collapse. The capacity rule needs
    // to see both.
    expect(slots.map((slot) => ({
      groupId: slot.groupId,
      scheduledDate: slot.scheduledDate.toISOString().slice(0, 10),
      timeSlotStart: slot.timeSlotStart,
      timeSlotEnd: slot.timeSlotEnd,
      isOwnAgency: slot.isOwnAgency,
    }))).toEqual([
      {
        groupId: eligibleGroupId,
        scheduledDate: '2026-08-03',
        timeSlotStart: '09:00',
        timeSlotEnd: '10:00',
        isOwnAgency: true,
      },
      {
        groupId: eligibleGroupId,
        scheduledDate: '2026-08-03',
        timeSlotStart: '09:00',
        timeSlotEnd: '10:00',
        isOwnAgency: true,
      },
      {
        groupId: eligibleGroupId,
        scheduledDate: '2026-08-04',
        timeSlotStart: '13:00',
        timeSlotEnd: '14:00',
        isOwnAgency: true,
      },
      // Another agency's appointment in the same group: it occupies the
      // inspector, so it must be returned for counting, flagged not-own so the
      // domain rule never offers its window.
      {
        groupId: eligibleGroupId,
        scheduledDate: '2026-08-04',
        timeSlotStart: '16:00',
        timeSlotEnd: '17:00',
        isOwnAgency: false,
      },
    ]);
    expect(slots.every((slot) => slot.groupId !== farOnlyGroupId)).toBe(true);
    expect(slots.every((slot) => slot.groupId !== foreignGroupId)).toBe(true);
    expect(slots[0]!.inspectorName).toBe('Slot Inspector');
    expect(slots[0]!.suburb).toBe('Near Slot');
  });

  it('excludes cancelled, rejected and soft-deleted members from the member list', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Portal Inactive Members Agency');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const { inspectorId } = await seedInspector(harness.prisma, 'Inactive Members Inspector');

    const portalPropertyId = await seedPropertyPoint(harness.prisma, {
      tenantId, branchId, suburb: 'Inactive Home', lat: -33.865, lng: 151.209,
    });
    const nearPropertyId = await seedPropertyPoint(harness.prisma, {
      tenantId, branchId, suburb: 'Inactive Near', lat: -33.866, lng: 151.210,
    });

    const groupId = await seedAcceptedGroup(harness.prisma, {
      serviceTypeId, createdByUserId: userId, inspectorId,
    });

    const base = {
      tenantId,
      branchId,
      propertyId: nearPropertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId,
      scheduledDate: SLOT_ONE_DATE,
    };
    await seedAppointment(harness.prisma, { ...base, timeSlotStart: '09:00', timeSlotEnd: '10:00' });
    await seedAppointment(harness.prisma, { ...base, timeSlotStart: '10:00', timeSlotEnd: '11:00', status: 'CANCELLED' });
    await seedAppointment(harness.prisma, { ...base, timeSlotStart: '11:00', timeSlotEnd: '12:00', status: 'REJECTED' });
    await seedAppointment(harness.prisma, { ...base, timeSlotStart: '12:00', timeSlotEnd: '13:00', deleted: true });

    const slots = await repo.findPortalEligibleSlots({
      tenantId,
      serviceTypeId,
      propertyId: portalPropertyId,
      today: TODAY,
    });

    // A cancelled visit frees the inspector, so it must not eat into capacity.
    expect(slots.map((slot) => `${slot.timeSlotStart}-${slot.timeSlotEnd}`)).toEqual(['09:00-10:00']);
  });

  it('no longer hides a group whose confirmed_count passed the retired cap of 10', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Portal Retired Cap Agency');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const { inspectorId } = await seedInspector(harness.prisma, 'Retired Cap Inspector');

    const portalPropertyId = await seedPropertyPoint(harness.prisma, {
      tenantId, branchId, suburb: 'Retired Home', lat: -33.865, lng: 151.209,
    });
    const nearPropertyId = await seedPropertyPoint(harness.prisma, {
      tenantId, branchId, suburb: 'Retired Near', lat: -33.866, lng: 151.210,
    });

    const groupId = await seedAcceptedGroup(harness.prisma, {
      serviceTypeId, createdByUserId: userId, inspectorId, confirmedCount: 12,
    });
    await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId: nearPropertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId,
      scheduledDate: SLOT_ONE_DATE,
      timeSlotStart: '09:00',
      timeSlotEnd: '17:00',
    });

    const slots = await repo.findPortalEligibleSlots({
      tenantId,
      serviceTypeId,
      propertyId: portalPropertyId,
      today: TODAY,
    });

    expect(slots.map((slot) => slot.groupId)).toEqual([groupId]);
  });

  // Six contenders rather than two on purpose: with only two, the pair of
  // transactions interleave rarely enough that this test passed even with the
  // `FOR UPDATE` removed. Six makes the unlocked version fail reliably, which
  // is what makes it evidence of the lock rather than decoration.
  it('lets only one of several concurrent joins take the last opening in a window', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Portal Race Agency');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const { inspectorId } = await seedInspector(harness.prisma, 'Race Inspector');

    const nearPropertyId = await seedPropertyPoint(harness.prisma, {
      tenantId, branchId, suburb: 'Race Near', lat: -33.866, lng: 151.210,
    });

    const groupId = await seedAcceptedGroup(harness.prisma, {
      serviceTypeId, createdByUserId: userId, inspectorId,
    });

    // 09:00-10:00 holds two inspections; one is taken, so exactly one is left.
    await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId: nearPropertyId, serviceTypeId,
      createdByUserId: userId, groupId,
      scheduledDate: SLOT_ONE_DATE, timeSlotStart: '09:00', timeSlotEnd: '10:00',
    });

    // Two tenants, two portal tokens, both outside the group and both about to
    // claim that single opening.
    const contenders = await Promise.all([1, 2, 3, 4, 5, 6].map(() => seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId: nearPropertyId, serviceTypeId,
      createdByUserId: userId, groupId: null,
      scheduledDate: SLOT_TWO_DATE, timeSlotStart: '14:00', timeSlotEnd: '15:00',
    })));

    const reserve = (appointmentId: string) => repo.reservePortalWindow({
      groupId,
      appointmentId,
      tenantId,
      scheduledDate: SLOT_ONE_DATE.toISOString().slice(0, 10),
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
      inspectorId,
    });

    const results = await Promise.all(contenders.map(reserve));

    // Without the group-row lock both transactions read "one left" and both win.
    expect(results.filter(Boolean)).toHaveLength(1);

    const joined = await harness.prisma.appointment.findMany({
      where: { id: { in: contenders }, service_group_id: groupId },
      select: { id: true, time_slot_start: true, rental_tenant_confirmation_status: true },
    });
    expect(joined).toHaveLength(1);
    expect(joined[0]!.time_slot_start).toBe('09:00');
    expect(joined[0]!.rental_tenant_confirmation_status).toBe('CONFIRMED');

    // The loser is untouched — no half-applied move.
    const loserId = contenders.find((id) => id !== joined[0]!.id)!;
    const loser = await harness.prisma.appointment.findUnique({
      where: { id: loserId },
      select: { service_group_id: true, time_slot_start: true, inspector_id: true },
    });
    expect(loser).toMatchObject({
      service_group_id: null,
      time_slot_start: '14:00',
      inspector_id: null,
    });
  });

  it('refuses to reserve a window that is already at capacity', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Portal Full Window Agency');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const { inspectorId } = await seedInspector(harness.prisma, 'Full Window Inspector');

    const nearPropertyId = await seedPropertyPoint(harness.prisma, {
      tenantId, branchId, suburb: 'Full Near', lat: -33.866, lng: 151.210,
    });
    const groupId = await seedAcceptedGroup(harness.prisma, {
      serviceTypeId, createdByUserId: userId, inspectorId,
    });

    for (let i = 0; i < 2; i += 1) {
      await seedAppointment(harness.prisma, {
        tenantId, branchId, propertyId: nearPropertyId, serviceTypeId,
        createdByUserId: userId, groupId,
        scheduledDate: SLOT_ONE_DATE, timeSlotStart: '09:00', timeSlotEnd: '10:00',
      });
    }
    const outsiderId = await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId: nearPropertyId, serviceTypeId,
      createdByUserId: userId, groupId: null,
      scheduledDate: SLOT_TWO_DATE, timeSlotStart: '14:00', timeSlotEnd: '15:00',
    });

    const reserved = await repo.reservePortalWindow({
      groupId,
      appointmentId: outsiderId,
      tenantId,
      scheduledDate: SLOT_ONE_DATE.toISOString().slice(0, 10),
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
      inspectorId,
    });

    expect(reserved).toBe(false);
    const untouched = await harness.prisma.appointment.findUnique({
      where: { id: outsiderId },
      select: { service_group_id: true, time_slot_start: true },
    });
    expect(untouched).toMatchObject({ service_group_id: null, time_slot_start: '14:00' });
  });

  it('excludes the appointment current group when excludeGroupId is provided', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Portal Exclude Agency');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const { inspectorId } = await seedInspector(harness.prisma, 'Exclude Inspector');

    const portalPropertyId = await seedPropertyPoint(harness.prisma, {
      tenantId,
      branchId,
      suburb: 'Exclude Home',
      lat: -33.865,
      lng: 151.209,
    });
    const nearPropertyId = await seedPropertyPoint(harness.prisma, {
      tenantId,
      branchId,
      suburb: 'Exclude Near',
      lat: -33.866,
      lng: 151.210,
    });

    const ownGroupId = await seedAcceptedGroup(harness.prisma, {
      serviceTypeId,
      createdByUserId: userId,
      inspectorId,
    });
    await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId: portalPropertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId: ownGroupId,
      scheduledDate: SLOT_ONE_DATE,
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
    });
    const otherGroupId = await seedAcceptedGroup(harness.prisma, {
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
      groupId: otherGroupId,
      scheduledDate: SLOT_TWO_DATE,
      timeSlotStart: '11:00',
      timeSlotEnd: '12:00',
    });

    const withoutExclusion = await repo.findPortalEligibleSlots({
      tenantId,
      serviceTypeId,
      propertyId: portalPropertyId,
      today: TODAY,
    });
    expect(withoutExclusion.map((slot) => slot.groupId).sort()).toEqual(
      [ownGroupId, otherGroupId].sort(),
    );

    const withExclusion = await repo.findPortalEligibleSlots({
      tenantId,
      serviceTypeId,
      propertyId: portalPropertyId,
      today: TODAY,
      excludeGroupId: ownGroupId,
    });
    expect(withExclusion.map((slot) => slot.groupId)).toEqual([otherGroupId]);
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
