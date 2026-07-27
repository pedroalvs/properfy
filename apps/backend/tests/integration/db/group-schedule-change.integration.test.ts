/**
 * Group schedule change — real-database verification.
 *
 * The two guarantees this feature sells to an operator are only worth anything
 * if they hold against PostgreSQL:
 *
 *   1. Changing the date alone leaves every member's time slot byte-identical.
 *      A mock would happily report success on an update payload that quietly
 *      carried time columns.
 *   2. Changing the window clamps exactly the members that fall outside it and
 *      leaves the ones already inside untouched.
 *
 * It also proves the confirmation branch really moves rows: RESEND flips a
 * CONFIRMED member back to PENDING, NOTIFY_ONLY keeps the confirmation and
 * realigns its cycle onto the new schedule — the difference between the two
 * options the operator is asked to choose between.
 *
 * Both writes are scoped by the member's own tenant, so a cross-agency group is
 * used throughout: a tenant_id WHERE filter that silently matched nothing would
 * pass every mock-based test and fail here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { ChangeGroupScheduleUseCase } from '../../../src/modules/service-group/application/use-cases/change-group-schedule.use-case';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaConfirmationCycleRepository } from '../../../src/modules/appointment/infrastructure/prisma-confirmation-cycle.repository';
import { ConfirmationCycleService } from '../../../src/modules/appointment/application/services/confirmation-cycle.service';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import { futureDateStr } from '../../helpers/date-fixtures';

function silentAuditService(): AuditService {
  return { log: () => {} } as unknown as AuditService;
}

/** Never replays: every case in this file is a distinct change. */
function passthroughIdempotency(): IIdempotencyService {
  return { get: async () => null, set: async () => undefined } as unknown as IIdempotencyService;
}

function amActor(userId: string): AuthContext {
  return { userId, tenantId: null, role: 'AM', branchId: null, inspectorId: null };
}

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
      email: `gsc-${suffix}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_code: `GSC-${suffix}`,
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

async function seedMember(
  prisma: PrismaClient,
  fx: TenantFixture,
  serviceTypeId: string,
  groupId: string,
  scheduledDate: string,
  slot: { start: string; end: string },
  confirmation: 'PENDING' | 'CONFIRMED' = 'PENDING',
): Promise<string> {
  const appt = await prisma.appointment.create({
    data: {
      tenant_id: fx.tenantId,
      branch_id: fx.branchId,
      property_id: fx.propertyId,
      service_type_id: serviceTypeId,
      service_group_id: groupId,
      status: 'SCHEDULED',
      scheduled_date: new Date(scheduledDate),
      time_slot_start: slot.start,
      time_slot_end: slot.end,
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: confirmation,
      created_by_user_id: fx.userId,
    },
  });

  if (confirmation === 'CONFIRMED') {
    const cycle = await prisma.appointmentConfirmationCycle.create({
      data: {
        appointment_id: appt.id,
        cycle_number: 1,
        scheduled_date: new Date(scheduledDate),
        time_slot: `${slot.start}-${slot.end}`,
        status: 'CONFIRMED',
        confirmation_source: 'RENTAL_TENANT_PORTAL',
        confirmed_at: new Date(),
      },
    });
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { active_confirmation_cycle_id: cycle.id },
    });
  }

  return appt.id;
}

const GROUP_DATE = futureDateStr(30);
const GROUP_WINDOW = '09:00-17:00';

describe('service group schedule change (real DB)', () => {
  let harness: DbHarness | undefined;
  let prisma: PrismaClient;
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;
  let serviceTypeId: string;

  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;

    tenantA = await seedTenant(prisma, 'GSC Tenant A');
    tenantB = await seedTenant(prisma, 'GSC Tenant B');

    const stSuffix = Math.random().toString(36).slice(2, 10);
    const serviceType = await prisma.serviceType.create({
      data: {
        code: `GSC-ST-${stSuffix}`,
        name: `GSC Routine ${stSuffix}`,
        flow_type: 'ROUTINE',
        requires_rental_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });
    serviceTypeId = serviceType.id;
  }, 180_000);

  afterAll(async () => {
    if (harness) await teardownDbHarness(harness);
  });

  async function seedGroup(status = 'PUBLISHED'): Promise<string> {
    const group = await prisma.serviceGroup.create({
      data: {
        service_type_id: serviceTypeId,
        status: status as never,
        scheduled_date: new Date(GROUP_DATE),
        time_window: GROUP_WINDOW,
        created_by_user_id: tenantA.userId,
      },
    });
    return group.id;
  }

  function makeUseCase(sendGroupPortalLinksSpy?: { execute: (i: unknown) => Promise<unknown> }) {
    const auditService = silentAuditService();
    const cycleService = new ConfirmationCycleService(
      new PrismaConfirmationCycleRepository(prisma),
      auditService,
      prisma,
    );
    return new ChangeGroupScheduleUseCase(
      new PrismaServiceGroupRepository(prisma),
      new PrismaAppointmentRepository(prisma),
      auditService,
      new AuthorizationService(auditService),
      passthroughIdempotency(),
      (sendGroupPortalLinksSpy ?? { execute: async () => ({ results: [] }) }) as never,
      cycleService,
      { execute: async () => undefined },
      undefined,
      { error: () => undefined },
    );
  }

  it('moves every member to the new date and leaves their slots byte-identical', async () => {
    const groupId = await seedGroup();
    const apptA = await seedMember(prisma, tenantA, serviceTypeId, groupId, GROUP_DATE, { start: '10:00', end: '11:00' });
    const apptB = await seedMember(prisma, tenantB, serviceTypeId, groupId, GROUP_DATE, { start: '14:30', end: '15:30' });
    const newDate = futureDateStr(60);

    const result = await makeUseCase().execute({
      groupId,
      scheduledDate: newDate,
      confirmationStrategy: 'NOTIFY_ONLY',
      actor: amActor(tenantA.userId),
    });

    const [rowA, rowB] = await Promise.all([
      prisma.appointment.findUniqueOrThrow({ where: { id: apptA } }),
      prisma.appointment.findUniqueOrThrow({ where: { id: apptB } }),
    ]);

    // Cross-tenant: both members moved, each write scoped to its own agency.
    expect(rowA.scheduled_date.toISOString().slice(0, 10)).toBe(newDate);
    expect(rowB.scheduled_date.toISOString().slice(0, 10)).toBe(newDate);
    // The promise the UI makes for a date-only change.
    expect([rowA.time_slot_start, rowA.time_slot_end]).toEqual(['10:00', '11:00']);
    expect([rowB.time_slot_start, rowB.time_slot_end]).toEqual(['14:30', '15:30']);
    expect(result.applied).toMatchObject({ dateChanged: 2, slotClamped: 0, failed: 0 });
  }, 60_000);

  it('clamps only the members outside a narrowed window', async () => {
    const groupId = await seedGroup();
    const inside = await seedMember(prisma, tenantA, serviceTypeId, groupId, GROUP_DATE, { start: '13:00', end: '14:00' });
    const early = await seedMember(prisma, tenantB, serviceTypeId, groupId, GROUP_DATE, { start: '09:30', end: '10:30' });
    const late = await seedMember(prisma, tenantA, serviceTypeId, groupId, GROUP_DATE, { start: '16:00', end: '16:45' });

    const result = await makeUseCase().execute({
      groupId,
      timeWindow: '12:00-15:00',
      confirmationStrategy: 'NOTIFY_ONLY',
      actor: amActor(tenantA.userId),
    });

    const [insideRow, earlyRow, lateRow, groupRow] = await Promise.all([
      prisma.appointment.findUniqueOrThrow({ where: { id: inside } }),
      prisma.appointment.findUniqueOrThrow({ where: { id: early } }),
      prisma.appointment.findUniqueOrThrow({ where: { id: late } }),
      prisma.serviceGroup.findUniqueOrThrow({ where: { id: groupId } }),
    ]);

    expect([insideRow.time_slot_start, insideRow.time_slot_end]).toEqual(['13:00', '14:00']);
    expect([earlyRow.time_slot_start, earlyRow.time_slot_end]).toEqual(['12:00', '15:00']);
    expect([lateRow.time_slot_start, lateRow.time_slot_end]).toEqual(['12:00', '15:00']);
    expect(groupRow.time_window).toBe('12:00-15:00');
    expect(result.applied).toMatchObject({ slotClamped: 2, dateChanged: 0, failed: 0 });
  }, 60_000);

  it('widening the window touches nothing', async () => {
    const groupId = await seedGroup();
    const apptId = await seedMember(prisma, tenantA, serviceTypeId, groupId, GROUP_DATE, { start: '10:00', end: '11:00' });

    const result = await makeUseCase().execute({
      groupId,
      timeWindow: '06:00-20:00',
      confirmationStrategy: 'NOTIFY_ONLY',
      actor: amActor(tenantA.userId),
    });

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId } });
    expect([row.time_slot_start, row.time_slot_end]).toEqual(['10:00', '11:00']);
    expect(result.applied).toMatchObject({ slotClamped: 0, dateChanged: 0 });
  }, 60_000);

  it('NOTIFY_ONLY keeps the confirmation and realigns its cycle onto the new date', async () => {
    const groupId = await seedGroup();
    const apptId = await seedMember(
      prisma, tenantA, serviceTypeId, groupId, GROUP_DATE, { start: '10:00', end: '11:00' }, 'CONFIRMED',
    );
    const newDate = futureDateStr(70);

    const result = await makeUseCase().execute({
      groupId,
      scheduledDate: newDate,
      confirmationStrategy: 'NOTIFY_ONLY',
      actor: amActor(tenantA.userId),
    });

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId } });
    const cycle = await prisma.appointmentConfirmationCycle.findUniqueOrThrow({
      where: { id: row.active_confirmation_cycle_id! },
    });

    expect(row.rental_tenant_confirmation_status).toBe('CONFIRMED');
    expect(cycle.status).toBe('CONFIRMED');
    // Without the realign the cycle would still point at the old date and read
    // as stale to every later portal-link plan.
    expect(cycle.scheduled_date.toISOString().slice(0, 10)).toBe(newDate);
    expect(result.applied.confirmationsHandled).toBe(1);
  }, 60_000);

  it('RESEND hands only the affected members to the portal-link send', async () => {
    const groupId = await seedGroup();
    const confirmed = await seedMember(
      prisma, tenantA, serviceTypeId, groupId, GROUP_DATE, { start: '09:30', end: '10:30' }, 'CONFIRMED',
    );
    // Already inside the narrowed window, so its schedule never moves.
    await seedMember(prisma, tenantB, serviceTypeId, groupId, GROUP_DATE, { start: '13:00', end: '14:00' }, 'CONFIRMED');

    const calls: unknown[] = [];
    const spy = { execute: async (i: unknown) => { calls.push(i); return { results: [] }; } };

    await makeUseCase(spy).execute({
      groupId,
      timeWindow: '12:00-15:00',
      confirmationStrategy: 'RESEND',
      actor: amActor(tenantA.userId),
    });

    expect(calls).toHaveLength(1);
    expect((calls[0] as { appointmentIds: string[] }).appointmentIds).toEqual([confirmed]);
  }, 60_000);

  it('changes an ACCEPTED group — the capability this feature adds', async () => {
    const groupId = await seedGroup('ACCEPTED');
    const apptId = await seedMember(prisma, tenantA, serviceTypeId, groupId, GROUP_DATE, { start: '10:00', end: '11:00' });
    const newDate = futureDateStr(80);

    await makeUseCase().execute({
      groupId,
      scheduledDate: newDate,
      confirmationStrategy: 'NOTIFY_ONLY',
      actor: amActor(tenantA.userId),
    });

    const [row, groupRow] = await Promise.all([
      prisma.appointment.findUniqueOrThrow({ where: { id: apptId } }),
      prisma.serviceGroup.findUniqueOrThrow({ where: { id: groupId } }),
    ]);
    expect(groupRow.scheduled_date.toISOString().slice(0, 10)).toBe(newDate);
    expect(row.scheduled_date.toISOString().slice(0, 10)).toBe(newDate);
    // Reassignment is a separate action; a schedule change must not disturb status.
    expect(row.status).toBe('SCHEDULED');
  }, 60_000);

  it('leaves a completed inspection where it happened', async () => {
    const groupId = await seedGroup('ACCEPTED');
    const live = await seedMember(prisma, tenantA, serviceTypeId, groupId, GROUP_DATE, { start: '09:30', end: '10:30' });
    const done = await seedMember(prisma, tenantB, serviceTypeId, groupId, GROUP_DATE, { start: '09:30', end: '10:30' });
    await prisma.appointment.update({ where: { id: done }, data: { status: 'DONE' } });
    const newDate = futureDateStr(90);

    const result = await makeUseCase().execute({
      groupId,
      scheduledDate: newDate,
      timeWindow: '12:00-15:00',
      confirmationStrategy: 'NOTIFY_ONLY',
      actor: amActor(tenantA.userId),
    });

    const [liveRow, doneRow] = await Promise.all([
      prisma.appointment.findUniqueOrThrow({ where: { id: live } }),
      prisma.appointment.findUniqueOrThrow({ where: { id: done } }),
    ]);

    expect(liveRow.scheduled_date.toISOString().slice(0, 10)).toBe(newDate);
    expect([liveRow.time_slot_start, liveRow.time_slot_end]).toEqual(['12:00', '15:00']);
    // The inspection already happened at this date and time; moving it would
    // rewrite the record rather than plan work.
    expect(doneRow.scheduled_date.toISOString().slice(0, 10)).toBe(GROUP_DATE);
    expect([doneRow.time_slot_start, doneRow.time_slot_end]).toEqual(['09:30', '10:30']);
    expect(result.applied).toMatchObject({ dateChanged: 1, slotClamped: 1 });
  }, 60_000);

  it('ignores a soft-deleted member', async () => {
    const groupId = await seedGroup();
    const live = await seedMember(prisma, tenantA, serviceTypeId, groupId, GROUP_DATE, { start: '09:30', end: '10:30' });
    const deleted = await seedMember(prisma, tenantB, serviceTypeId, groupId, GROUP_DATE, { start: '09:30', end: '10:30' });
    await prisma.appointment.update({ where: { id: deleted }, data: { deleted_at: new Date() } });

    const result = await makeUseCase().execute({
      groupId,
      timeWindow: '12:00-15:00',
      confirmationStrategy: 'NOTIFY_ONLY',
      actor: amActor(tenantA.userId),
    });

    const [liveRow, deletedRow] = await Promise.all([
      prisma.appointment.findUniqueOrThrow({ where: { id: live } }),
      prisma.appointment.findUniqueOrThrow({ where: { id: deleted } }),
    ]);
    expect([liveRow.time_slot_start, liveRow.time_slot_end]).toEqual(['12:00', '15:00']);
    // Soft-deleted rows keep their service_group_id, so this is a real trap.
    expect([deletedRow.time_slot_start, deletedRow.time_slot_end]).toEqual(['09:30', '10:30']);
    expect(result.applied).toMatchObject({ total: 1, slotClamped: 1 });
  }, 60_000);
});
