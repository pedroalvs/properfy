/**
 * Real-DB proof that a portal group join is all-or-nothing.
 *
 * `reservePortalWindow` used to commit in its own transaction before the status
 * hops ran, so a failing hop left the appointment holding a slot in a live group
 * with a stale status, the old group decremented and the new one never
 * incremented. No mock can prove the fix: whether the reservation actually rolls
 * back with the hops is decided by Postgres, not by TypeScript.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupDbHarness, teardownDbHarness, seedLegacyDoneAppointment, type DbHarness } from './harness';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { JoinGroupUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/join-group.use-case';

let harness: DbHarness;
let appointmentRepo: PrismaAppointmentRepository;
let serviceGroupRepo: PrismaServiceGroupRepository;
let fixture: Awaited<ReturnType<typeof seedLegacyDoneAppointment>>;
let inspectorId: string;
/** Geocoded property: the eligibility query needs coordinates within 2km. */
let propertyId: string;

const TARGET_DATE = '2031-05-14';
const SLOT_START = '13:00';
const SLOT_END = '15:00';

beforeAll(async () => {
  harness = await setupDbHarness();
  appointmentRepo = new PrismaAppointmentRepository(harness.prisma);
  serviceGroupRepo = new PrismaServiceGroupRepository(harness.prisma);
  fixture = await seedLegacyDoneAppointment(harness.prisma);

  const inspector = await harness.prisma.inspector.create({
    data: {
      name: 'Join Atomicity Inspector',
      email: `join-atomicity-${Math.random().toString(36).slice(2, 10)}@test.local`,
      status: 'ACTIVE',
    },
  });
  inspectorId = inspector.id;

  // findPortalEligibleSlots joins on PostGIS coordinates and an ST_DWithin(2km)
  // radius, so the harness's plain fixture property is invisible to it.
  const rows = await harness.prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO properties (id, tenant_id, branch_id, property_code, type, street, suburb, postcode, state, country, geocoding_status, coordinates, created_at, updated_at)
    VALUES (
      gen_random_uuid(), ${fixture.tenantId}, ${fixture.branchId},
      ${'JA-' + Math.random().toString(36).slice(2, 10)},
      'HOUSE', '1 Atomicity St', 'Surry Hills', '2010', 'NSW', 'AU', 'SUCCESS',
      ST_SetSRID(ST_MakePoint(151.210, -33.886), 4326), NOW(), NOW()
    )
    RETURNING id
  `;
  propertyId = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

/** An ACCEPTED group holding one member on the target window, so the slot is offered. */
async function seedTargetGroup(): Promise<string> {
  const group = await harness.prisma.serviceGroup.create({
    data: {
      service_type_id: fixture.serviceTypeId,
      status: 'ACCEPTED',
      offered_count: 1,
      confirmed_count: 1,
      scheduled_date: new Date(TARGET_DATE),
      time_window: '08:00-17:00',
      assigned_inspector_id: inspectorId,
      assigned_at: new Date(),
      created_by_user_id: fixture.userId,
    },
  });
  await harness.prisma.appointment.create({
    data: {
      tenant_id: fixture.tenantId,
      branch_id: fixture.branchId,
      property_id: propertyId,
      service_type_id: fixture.serviceTypeId,
      status: 'SCHEDULED',
      scheduled_date: new Date(TARGET_DATE),
      time_slot_start: SLOT_START,
      time_slot_end: SLOT_END,
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'CONFIRMED',
      created_by_user_id: fixture.userId,
      service_group_id: group.id,
    },
  });
  return group.id;
}

async function seedJoiner(status: string, previousGroupId: string | null): Promise<string> {
  const row = await harness.prisma.appointment.create({
    data: {
      tenant_id: fixture.tenantId,
      branch_id: fixture.branchId,
      property_id: propertyId,
      service_type_id: fixture.serviceTypeId,
      status: status as never,
      scheduled_date: new Date('2031-05-01'),
      time_slot_start: '09:00',
      time_slot_end: '11:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'UNAVAILABLE',
      created_by_user_id: fixture.userId,
      ...(previousGroupId ? { service_group_id: previousGroupId } : {}),
    },
  });
  return row.id;
}

async function seedToken(appointmentId: string): Promise<string> {
  const token = await harness.prisma.rentalTenantPortalToken.create({
    data: {
      appointment_id: appointmentId,
      token_hash: `join-atomicity-${Math.random().toString(36).slice(2, 12)}`,
      expires_at: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });
  return token.id;
}

function makeUseCase(statusTransition: unknown): JoinGroupUseCase {
  return new JoinGroupUseCase(
    appointmentRepo as never,
    serviceGroupRepo as never,
    { save: vi.fn() } as never,
    {
      tryClaim: vi.fn().mockResolvedValue(true),
      releaseClaim: vi.fn().mockResolvedValue(undefined),
    } as never,
    { log: vi.fn() } as never,
    statusTransition as never,
    undefined,
    undefined,
    undefined,
    { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as never,
    harness.prisma,
  );
}

function makeInput(appointmentId: string, tokenId: string, groupId: string) {
  return {
    tokenId,
    appointmentId,
    groupId,
    scheduledDate: TARGET_DATE,
    timeSlotStart: SLOT_START,
    timeSlotEnd: SLOT_END,
    isUsed: false,
    ipAddress: null,
    userAgent: null,
  };
}

describe('portal group join — atomicity', () => {
  it('leaves the appointment AND both group counters untouched when a hop fails', async () => {
    const targetGroupId = await seedTargetGroup();
    const previousGroupId = await seedTargetGroup();
    const appointmentId = await seedJoiner('AWAITING_INSPECTOR', previousGroupId);
    const tokenId = await seedToken(appointmentId);

    const before = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    const targetBefore = await harness.prisma.serviceGroup.findUnique({ where: { id: targetGroupId } });
    const previousBefore = await harness.prisma.serviceGroup.findUnique({ where: { id: previousGroupId } });

    const uc = makeUseCase({
      execute: vi.fn(),
      executeInTransaction: vi.fn().mockRejectedValue(new Error('hop exploded')),
    });

    await expect(
      uc.execute(makeInput(appointmentId, tokenId, targetGroupId)),
    ).rejects.toThrow('hop exploded');

    const after = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(after?.service_group_id).toBe(before?.service_group_id);
    expect(after?.scheduled_date?.toISOString()).toBe(before?.scheduled_date?.toISOString());
    expect(after?.time_slot_start).toBe(before?.time_slot_start);
    expect(after?.time_slot_end).toBe(before?.time_slot_end);
    expect(after?.inspector_id).toBe(before?.inspector_id);
    // reservePortalWindow raw-writes this one, so it is the tell-tale for a
    // reservation that committed on its own.
    expect(after?.rental_tenant_confirmation_status).toBe(
      before?.rental_tenant_confirmation_status,
    );

    const targetAfter = await harness.prisma.serviceGroup.findUnique({ where: { id: targetGroupId } });
    const previousAfter = await harness.prisma.serviceGroup.findUnique({ where: { id: previousGroupId } });
    expect(targetAfter?.confirmed_count).toBe(targetBefore?.confirmed_count);
    expect(previousAfter?.confirmed_count).toBe(previousBefore?.confirmed_count);
  });

  it('commits the slot, the counters and the status together on success', async () => {
    const targetGroupId = await seedTargetGroup();
    const previousGroupId = await seedTargetGroup();
    const appointmentId = await seedJoiner('AWAITING_INSPECTOR', previousGroupId);
    const tokenId = await seedToken(appointmentId);

    const targetBefore = await harness.prisma.serviceGroup.findUnique({ where: { id: targetGroupId } });
    const previousBefore = await harness.prisma.serviceGroup.findUnique({ where: { id: previousGroupId } });

    // The hop is stubbed, but it runs against the same transaction and its write
    // is applied here so the committed row reflects a complete join.
    const uc = makeUseCase({
      execute: vi.fn(),
      executeInTransaction: vi.fn(async (input: { targetStatus: string }, tx: never) => {
        await (tx as unknown as typeof harness.prisma).appointment.updateMany({
          where: { id: appointmentId },
          data: { status: input.targetStatus as never },
        });
        return { output: { status: input.targetStatus }, runAfterCommit: async () => {} };
      }),
    });

    await uc.execute(makeInput(appointmentId, tokenId, targetGroupId));

    const after = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(after?.service_group_id).toBe(targetGroupId);
    expect(after?.time_slot_start).toBe(SLOT_START);
    expect(after?.inspector_id).toBe(inspectorId);
    expect(after?.rental_tenant_confirmation_status).toBe('CONFIRMED');
    expect(after?.status).toBe('SCHEDULED');

    const targetAfter = await harness.prisma.serviceGroup.findUnique({ where: { id: targetGroupId } });
    const previousAfter = await harness.prisma.serviceGroup.findUnique({ where: { id: previousGroupId } });
    expect(targetAfter?.confirmed_count).toBe((targetBefore?.confirmed_count ?? 0) + 1);
    expect(previousAfter?.confirmed_count).toBe((previousBefore?.confirmed_count ?? 0) - 1);
  });

  it('reserves inside the caller transaction without opening a nested one', async () => {
    // Prisma.TransactionClient has no $transaction, so a nested attempt would
    // throw rather than silently open a second connection.
    const targetGroupId = await seedTargetGroup();
    const appointmentId = await seedJoiner('AWAITING_INSPECTOR', null);

    const reserved = await harness.prisma.$transaction((tx) =>
      serviceGroupRepo.reservePortalWindow({
        groupId: targetGroupId,
        appointmentId,
        tenantId: fixture.tenantId,
        scheduledDate: TARGET_DATE,
        timeSlotStart: SLOT_START,
        timeSlotEnd: SLOT_END,
        inspectorId,
      }, tx),
    );

    expect(reserved).toEqual({ ok: true });
    const row = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(row?.service_group_id).toBe(targetGroupId);
  });

  it('rolls the reservation back with the caller transaction', async () => {
    const targetGroupId = await seedTargetGroup();
    const appointmentId = await seedJoiner('AWAITING_INSPECTOR', null);

    await expect(
      harness.prisma.$transaction(async (tx) => {
        await serviceGroupRepo.reservePortalWindow({
          groupId: targetGroupId,
          appointmentId,
          tenantId: fixture.tenantId,
          scheduledDate: TARGET_DATE,
          timeSlotStart: SLOT_START,
          timeSlotEnd: SLOT_END,
          inspectorId,
        }, tx);
        throw new Error('caller aborted');
      }),
    ).rejects.toThrow('caller aborted');

    const row = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(row?.service_group_id).toBeNull();
  });
});
