import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';

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
