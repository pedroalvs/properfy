/**
 * Real-DB proof of which appointment statuses `reservePortalWindow` will move.
 *
 * The gate is a `WHERE status NOT IN (...)` inside the locked transaction, so a
 * mocked repository cannot prove it — the predicate only exists in SQL.
 *
 * The behaviour under test: a rental tenant who declined (and whose appointment
 * was therefore auto-rejected) must still be able to take another slot, while
 * genuinely dead appointments must stay untouchable.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, seedLegacyDoneAppointment, type DbHarness } from './harness';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';

let harness: DbHarness;
let repo: PrismaServiceGroupRepository;
let fixture: Awaited<ReturnType<typeof seedLegacyDoneAppointment>>;
let groupId: string;
let inspectorId: string;

const TARGET_DATE = '2031-03-12';
const SLOT_START = '13:00';
const SLOT_END = '15:00';

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaServiceGroupRepository(harness.prisma);
  fixture = await seedLegacyDoneAppointment(harness.prisma);

  const inspector = await harness.prisma.inspector.create({
    data: {
      name: 'Reserve Window Inspector',
      email: `reserve-window-${Math.random().toString(36).slice(2, 10)}@test.local`,
      status: 'ACTIVE',
    },
  });
  inspectorId = inspector.id;

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
  groupId = group.id;
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

/** A fresh appointment in `status`, unattached to the target group. */
async function seedAppointmentWithStatus(status: string): Promise<string> {
  const appointment = await harness.prisma.appointment.create({
    data: {
      tenant_id: fixture.tenantId,
      branch_id: fixture.branchId,
      property_id: fixture.propertyId,
      service_type_id: fixture.serviceTypeId,
      status: status as never,
      scheduled_date: new Date('2031-01-05'),
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'UNAVAILABLE',
      created_by_user_id: fixture.userId,
    },
  });
  return appointment.id;
}

function reserve(appointmentId: string) {
  return repo.reservePortalWindow({
    groupId,
    appointmentId,
    tenantId: fixture.tenantId,
    scheduledDate: TARGET_DATE,
    timeSlotStart: SLOT_START,
    timeSlotEnd: SLOT_END,
    inspectorId,
  });
}

describe('reservePortalWindow — appointment status gate', () => {
  it('moves a REJECTED appointment, so a declined tenant can pick another time', async () => {
    const appointmentId = await seedAppointmentWithStatus('REJECTED');

    await expect(reserve(appointmentId)).resolves.toEqual({ ok: true });

    const row = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(row?.service_group_id).toBe(groupId);
    expect(row?.time_slot_start).toBe(SLOT_START);
    expect(row?.inspector_id).toBe(inspectorId);
    // The raw column write is why the caller has to realign the confirmation cycle.
    expect(row?.rental_tenant_confirmation_status).toBe('CONFIRMED');
    // Status itself is untouched here — the caller transitions it afterwards.
    expect(row?.status).toBe('REJECTED');
  });

  it('moves an AWAITING_INSPECTOR appointment', async () => {
    const appointmentId = await seedAppointmentWithStatus('AWAITING_INSPECTOR');

    await expect(reserve(appointmentId)).resolves.toEqual({ ok: true });
  });

  it.each(['CANCELLED', 'DONE', 'DRAFT'])('refuses a %s appointment', async (status) => {
    const appointmentId = await seedAppointmentWithStatus(status);

    await expect(reserve(appointmentId)).resolves.toEqual({
      ok: false,
      reason: 'APPOINTMENT_INACTIVE',
    });

    const row = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(row?.service_group_id).toBeNull();
  });

  it('refuses an appointment belonging to another agency', async () => {
    const appointmentId = await seedAppointmentWithStatus('REJECTED');

    await expect(
      repo.reservePortalWindow({
        groupId,
        appointmentId,
        tenantId: '00000000-0000-0000-0000-000000000000',
        scheduledDate: TARGET_DATE,
        timeSlotStart: SLOT_START,
        timeSlotEnd: SLOT_END,
        inspectorId,
      }),
    ).resolves.toEqual({ ok: false, reason: 'APPOINTMENT_INACTIVE' });
  });
});
