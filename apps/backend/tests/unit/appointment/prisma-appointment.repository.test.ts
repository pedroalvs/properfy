import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { AppointmentRestrictionEntity } from '../../../src/modules/appointment/domain/appointment-restriction.entity';

describe('PrismaAppointmentRepository date filters', () => {
  const findMany = vi.fn();
  const count = vi.fn();

  const prisma = {
    appointment: {
      findMany,
      count,
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
  });

  it('filters by full UTC day range instead of exact midnight equality', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { inspectorId: 'insp-1', status: 'SCHEDULED', fromDate: '2026-03-21', toDate: '2026-03-21' },
      { page: 1, pageSize: 10, sortOrder: 'asc', sortBy: 'timeSlot' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduled_date: {
            gte: new Date('2026-03-21T00:00:00.000Z'),
            lt: new Date('2026-03-22T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('filters by time range (timeFrom/timeTo) against time_slot_start', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { timeFrom: '09:00', timeTo: '10:00' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          time_slot_start: { gte: '09:00', lte: '10:00' },
        }),
      }),
    );
  });

  it('filters by contactSearch across snapshot fields', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { contactSearch: 'john' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contacts: {
            some: {
              OR: [
                { snapshot_name: { contains: 'john', mode: 'insensitive' } },
                { snapshot_email: { contains: 'john', mode: 'insensitive' } },
                { snapshot_phone: { contains: 'john' } },
              ],
            },
          },
        }),
      }),
    );
  });

  it('filters by hasRentalTenantNote=true (non-null and non-empty)', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { hasRentalTenantNote: true },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    const call = findMany.mock.calls[0][0];
    expect(call.where.AND).toEqual(
      expect.arrayContaining([
        { rental_tenant_note: { not: null } },
        { NOT: { rental_tenant_note: '' } },
      ]),
    );
  });

  it('filters by hasRentalTenantNote=false (null or empty)', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { hasRentalTenantNote: false },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    const call = findMany.mock.calls[0][0];
    expect(call.where.AND).toEqual(
      expect.arrayContaining([
        { OR: [{ rental_tenant_note: null }, { rental_tenant_note: '' }] },
      ]),
    );
  });

  it('filters by confirmationStatus=sent using notifications subquery', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { confirmationStatus: 'sent' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          notifications: {
            some: expect.objectContaining({
              channel: 'EMAIL',
              status: expect.objectContaining({ in: expect.arrayContaining(['SENT', 'DELIVERED']) }),
            }),
          },
        }),
      }),
    );
  });

  it('does not add timeSlot filter when not provided', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      {},
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    const call = findMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('time_slot');
  });

  it('count uses same filters as findAll', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.count({ timeFrom: '10:00', timeTo: '11:00', confirmationStatus: 'not_sent' });

    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          time_slot_start: { gte: '10:00', lte: '11:00' },
          notifications: {
            none: expect.objectContaining({
              channel: 'EMAIL',
              status: expect.objectContaining({ in: expect.arrayContaining(['SENT', 'DELIVERED']) }),
            }),
          },
        }),
      }),
    );
  });
});

describe('PrismaAppointmentRepository property total area', () => {
  const findMany = vi.fn();
  const prisma = { appointment: { findMany, count: vi.fn() } } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
  });

  function makeRow(totalAreaM2: unknown) {
    return {
      id: 'appt-1',
      tenant_id: 'tenant-1',
      branch_id: 'branch-1',
      property_id: 'property-1',
      service_type_id: 'svc-1',
      inspector_id: null,
      status: 'DRAFT',
      scheduled_date: new Date('2026-04-01'),
      time_slot_start: '09:00',
      time_slot_end: '10:00',
      key_required: false,
      meeting_location: null,
      key_location: null,
      rental_tenant_confirmation_status: 'PENDING',
      price_amount: null,
      payout_amount: null,
      pricing_rule_snapshot_json: {},
      notes: null,
      custom_fields_json: null,
      reason: null,
      created_by_user_id: 'user-1',
      done_marked_by_user_id: null,
      done_checked_by_user_id: null,
      done_checked_at: null,
      service_group_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
      contacts: [],
      // `findAll` includes the restriction rows to flatten the rental tenant's
      // weekly availability onto the list; the double has to mirror that or the
      // mapper reads undefined.
      restrictions: [],
      property: {
        property_code: 'PROP-001',
        street: '21 King St',
        suburb: 'Sydney',
        state: 'NSW',
        postcode: '2000',
        lat: null,
        lng: null,
        total_area_m2: totalAreaM2,
      },
      tenant: { name: 'Agency', appointment_code_prefix: 'INS' },
      branch: { name: 'Main' },
      service_type: { name: 'Routine', flow_type: 'ROUTINE' },
      inspector: null,
      service_group: null,
    };
  }

  it('selects total_area_m2 on the property relation', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll({}, { page: 1, pageSize: 10, sortOrder: 'asc' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          property: { select: expect.objectContaining({ total_area_m2: true }) },
        }),
      }),
    );
  });

  it('converts the Prisma Decimal to a JS number', async () => {
    // Prisma returns Decimal for @db.Decimal columns; without Number() the value
    // serializes as an object and the m² card segment renders "[object Object]".
    const decimalLike = { toString: () => '82.5', toNumber: () => 82.5 };
    findMany.mockResolvedValue([makeRow(decimalLike)]);
    const repo = new PrismaAppointmentRepository(prisma);

    const rows = await repo.findAll({}, { page: 1, pageSize: 10, sortOrder: 'asc' });

    expect(rows[0]!.propertyTotalAreaM2).toBe(82.5);
    expect(typeof rows[0]!.propertyTotalAreaM2).toBe('number');
  });

  it('maps a missing area to null', async () => {
    findMany.mockResolvedValue([makeRow(null)]);
    const repo = new PrismaAppointmentRepository(prisma);

    const rows = await repo.findAll({}, { page: 1, pageSize: 10, sortOrder: 'asc' });

    expect(rows[0]!.propertyTotalAreaM2).toBeNull();
  });

  it('flattens the rental tenant availability onto the list row', async () => {
    const slots = [{ dayOfWeek: 'MON', start: '09:00', end: '12:00' }];
    const row = makeRow(null);
    row.restrictions = [{ available_slots_json: slots }] as never;
    findMany.mockResolvedValue([row]);
    const repo = new PrismaAppointmentRepository(prisma);

    const rows = await repo.findAll({}, { page: 1, pageSize: 10, sortOrder: 'asc' });

    expect(rows[0]!.rentalTenantAvailableSlots).toEqual(slots);
  });

  it('skips restriction rows without slots rather than returning the first row blindly', async () => {
    // The single restriction row is shared with the operator, so an operator-only
    // row (no slots) can sit ahead of the one that carries them.
    const slots = [{ dayOfWeek: 'FRI', start: '08:00', end: '10:00' }];
    const row = makeRow(null);
    row.restrictions = [
      { available_slots_json: null },
      { available_slots_json: slots },
    ] as never;
    findMany.mockResolvedValue([row]);
    const repo = new PrismaAppointmentRepository(prisma);

    const rows = await repo.findAll({}, { page: 1, pageSize: 10, sortOrder: 'asc' });

    expect(rows[0]!.rentalTenantAvailableSlots).toEqual(slots);
  });

  it('reports no availability as null when every restriction row lacks slots', async () => {
    const row = makeRow(null);
    row.restrictions = [{ available_slots_json: null }] as never;
    findMany.mockResolvedValue([row]);
    const repo = new PrismaAppointmentRepository(prisma);

    const rows = await repo.findAll({}, { page: 1, pageSize: 10, sortOrder: 'asc' });

    expect(rows[0]!.rentalTenantAvailableSlots).toBeNull();
  });
});

describe('PrismaAppointmentRepository overdueOnly + status composition', () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const prisma = { appointment: { findMany, count } } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
  });

  function whereOf() {
    return findMany.mock.calls[0][0].where;
  }

  it('intersects an explicit status filter with the overdue statuses', async () => {
    // Without the intersection the overdue branch discards `status` entirely, so
    // a board column asking for AWAITING_INSPECTOR would receive SCHEDULED rows
    // too — every overdue card would appear in two columns at once.
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { overdueOnly: true, status: ['AWAITING_INSPECTOR'] },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(whereOf().status).toEqual({ in: ['AWAITING_INSPECTOR'] });
  });

  it('matches nothing when the requested status can never be overdue', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { overdueOnly: true, status: ['DONE'] },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    // Empty `in` matches no rows — DONE is never overdue.
    expect(whereOf().status).toEqual({ in: [] });
  });

  it('keeps every overdue-eligible status when no status filter is supplied', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll({ overdueOnly: true }, { page: 1, pageSize: 10, sortOrder: 'asc' });

    // DRAFT is badge/filter eligible under the age rule (it is only the auto-cancel
    // sweep that must leave DRAFT alone).
    expect(whereOf().status).toEqual({ in: ['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED'] });
  });

  it('includes a stale DRAFT when the caller asks for that column', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { overdueOnly: true, status: ['DRAFT'] },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(whereOf().status).toEqual({ in: ['DRAFT'] });
  });

  it('filters on created_at age, not on scheduled_date', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll({ overdueOnly: true }, { page: 1, pageSize: 10, sortOrder: 'asc' });

    const where = whereOf();
    expect(where.created_at).toEqual({ lt: expect.any(Date) });
    // The old rule constrained scheduled_date; the age rule must not touch it at all,
    // otherwise a future-dated but long-stale appointment would be filtered out.
    expect(where.scheduled_date).toBeUndefined();
  });

  it('uses a cutoff 45 civil days back, as a real Sydney-midnight instant', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll({ overdueOnly: true }, { page: 1, pageSize: 10, sortOrder: 'asc' });

    const cutoff: Date = whereOf().created_at.lt;
    const ageDays = (Date.now() - cutoff.getTime()) / 86_400_000;
    // Between 45 and 46 days back: exactly 45 civil days, plus however far into the
    // current Sydney day we are.
    expect(ageDays).toBeGreaterThanOrEqual(45);
    expect(ageDays).toBeLessThan(47);
  });

  it('honours a Period range alongside overdueOnly', async () => {
    // Pre-existing bug: the overdue branch owned `scheduled_date`, so the Period
    // filter was a silent server-side no-op whenever "Overdue only" was on. The age
    // rule frees `scheduled_date`, so the two must now compose.
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { overdueOnly: true, fromDate: '2026-01-01', toDate: '2026-01-31' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    const where = whereOf();
    expect(where.created_at).toEqual({ lt: expect.any(Date) });
    expect(where.scheduled_date).toEqual({
      gte: new Date('2026-01-01T00:00:00.000Z'),
      lt: new Date('2026-02-01T00:00:00.000Z'),
    });
  });

  it('drops a partially-overdue status selection down to the overdue subset', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { overdueOnly: true, status: ['SCHEDULED', 'CANCELLED'] },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(whereOf().status).toEqual({ in: ['SCHEDULED'] });
  });

  it('applies the same intersection to count so totals match the rows', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.count({ overdueOnly: true, status: ['AWAITING_INSPECTOR'] });

    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['AWAITING_INSPECTOR'] } }),
      }),
    );
  });

  it('applies the same age cutoff to count as to findAll', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.count({ overdueOnly: true });

    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ created_at: { lt: expect.any(Date) } }),
      }),
    );
  });
});

describe('PrismaAppointmentRepository findOverdueForAutoCancel', () => {
  const findMany = vi.fn();
  const prisma = { appointment: { findMany } } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
  });

  it('selects by created_at age and excludes DRAFT from cancellation', async () => {
    const repo = new PrismaAppointmentRepository(prisma);
    const cutoff = new Date('2026-06-13T14:00:00.000Z');

    await repo.findOverdueForAutoCancel(cutoff, 500);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          created_at: { lt: cutoff },
          status: { in: ['AWAITING_INSPECTOR', 'SCHEDULED'] },
          deleted_at: null,
        },
        take: 500,
      }),
    );
    // DRAFT is badge-eligible but must never be auto-cancelled — it is the repair state.
    expect(findMany.mock.calls[0][0].where.status.in).not.toContain('DRAFT');
  });

  it('drains the oldest records first so a backlog clears from the top', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findOverdueForAutoCancel(new Date('2026-06-13T14:00:00.000Z'), 500);

    expect(findMany.mock.calls[0][0].orderBy).toEqual({ created_at: 'asc' });
  });

  it('stays cross-tenant — it backs a background sweep, not a request', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findOverdueForAutoCancel(new Date('2026-06-13T14:00:00.000Z'), 500);

    expect(findMany.mock.calls[0][0].where.tenant_id).toBeUndefined();
  });
});

describe('PrismaAppointmentRepository.replaceRestrictions', () => {
  const deleteMany = vi.fn();
  const create = vi.fn();
  const $transaction = vi.fn();

  const prisma = {
    appointmentRestriction: { deleteMany, create },
    $transaction,
  } as any;

  const restriction = new AppointmentRestrictionEntity({
    id: 'restriction-1',
    appointmentId: 'appt-1',
    isHome: true,
    unavailableDaysJson: null,
    unavailableHoursJson: null,
    availableSlotsJson: [{ dayOfWeek: 'WED', start: '09:00', end: '17:00' }],
    notes: 'Ring the bell',
    source: 'OPERATOR',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    deleteMany.mockReturnValue({ op: 'delete' });
    create.mockReturnValue({ op: 'create' });
    $transaction.mockResolvedValue([]);
  });

  // Restriction upserts are delete-then-create. Issued as two separate round trips, a
  // failure in between leaves zero rows and permanently loses the availability a rental
  // tenant submitted — so both operations must go through one $transaction call.
  it('performs the delete and the create in a single transaction', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.replaceRestrictions('appt-1', restriction);

    expect($transaction).toHaveBeenCalledTimes(1);
    expect($transaction.mock.calls[0][0]).toEqual([{ op: 'delete' }, { op: 'create' }]);
    expect(deleteMany).toHaveBeenCalledWith({ where: { appointment_id: 'appt-1' } });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          appointment_id: 'appt-1',
          is_home: true,
          notes: 'Ring the bell',
          source: 'OPERATOR',
          available_slots_json: [{ dayOfWeek: 'WED', start: '09:00', end: '17:00' }],
        }),
      }),
    );
  });

  it('transacts a delete alone when clearing', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.replaceRestrictions('appt-1', null);

    expect($transaction).toHaveBeenCalledTimes(1);
    expect($transaction.mock.calls[0][0]).toEqual([{ op: 'delete' }]);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('PrismaAppointmentRepository.deleteContactsByAppointmentId', () => {
  const deleteMany = vi.fn();
  const prisma = { appointmentContact: { deleteMany } } as any;

  beforeEach(() => {
    deleteMany.mockReset();
    deleteMany.mockResolvedValue({ count: 0 });
  });

  // appointment_contacts carries no tenant_id of its own — it is scoped through
  // the appointment. Defence in depth: the use case has already resolved the
  // appointment in the actor's tenant, so an unscoped delete would only fire on
  // an id mix-up, which is exactly when it must not wipe another agency's rows.
  it('scopes the delete to the owning tenant via the appointment relation', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.deleteContactsByAppointmentId('appt-1', 'tenant-1');

    expect(deleteMany).toHaveBeenCalledWith({
      where: { appointment_id: 'appt-1', appointment: { tenant_id: 'tenant-1' } },
    });
  });

  it('falls back to the appointment id alone when no tenant is given', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.deleteContactsByAppointmentId('appt-1');

    expect(deleteMany).toHaveBeenCalledWith({ where: { appointment_id: 'appt-1' } });
  });
});
