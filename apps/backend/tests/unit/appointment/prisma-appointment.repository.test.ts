import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { startOfPlatformToday } from '../../../src/shared/domain/timezone-date';

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

  it('keeps both overdue statuses when no status filter is supplied', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll({ overdueOnly: true }, { page: 1, pageSize: 10, sortOrder: 'asc' });

    expect(whereOf().status).toEqual({ in: ['SCHEDULED', 'AWAITING_INSPECTOR'] });
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
});

describe('PrismaAppointmentRepository overdueOnly + date range composition', () => {
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

  /** The overdue cut-off the repository uses — same helper, so no clock coupling. */
  function today() {
    return startOfPlatformToday();
  }

  it('keeps the caller fromDate instead of discarding it', async () => {
    // Previously the overdue branch overwrote scheduled_date outright, so
    // "overdue appointments scheduled in August" silently returned every
    // overdue appointment ever.
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { overdueOnly: true, fromDate: '2026-08-01' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(whereOf().scheduled_date).toEqual({
      gte: new Date('2026-08-01T00:00:00.000Z'),
      lt: today(),
    });
  });

  it('uses the caller toDate when it is tighter than the overdue cut-off', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { overdueOnly: true, toDate: '2020-01-01' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    // Exclusive upper bound is the day AFTER toDate, and it is well before today.
    expect(whereOf().scheduled_date).toEqual({ lt: new Date('2020-01-02T00:00:00.000Z') });
  });

  it('keeps the overdue cut-off when the caller toDate is in the future', async () => {
    // An appointment scheduled tomorrow is not overdue, however wide the range.
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { overdueOnly: true, toDate: '2999-01-01' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(whereOf().scheduled_date).toEqual({ lt: today() });
  });

  it('composes both bounds at once', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { overdueOnly: true, fromDate: '2026-01-01', toDate: '2999-01-01' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(whereOf().scheduled_date).toEqual({
      gte: new Date('2026-01-01T00:00:00.000Z'),
      lt: today(),
    });
  });

  it('still caps at today when no range is given', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll({ overdueOnly: true }, { page: 1, pageSize: 10, sortOrder: 'asc' });

    expect(whereOf().scheduled_date).toEqual({ lt: today() });
  });

  it('applies the same composition to count so totals match the rows', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.count({ overdueOnly: true, fromDate: '2026-08-01' });

    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduled_date: { gte: new Date('2026-08-01T00:00:00.000Z'), lt: today() },
        }),
      }),
    );
  });

  it('leaves the non-overdue date filter untouched', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { fromDate: '2026-08-01', toDate: '2026-08-31' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(whereOf().scheduled_date).toEqual({
      gte: new Date('2026-08-01T00:00:00.000Z'),
      lt: new Date('2026-09-01T00:00:00.000Z'),
    });
  });
});
