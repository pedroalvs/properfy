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
                { tenant_name: { contains: 'john', mode: 'insensitive' } },
                { primary_email: { contains: 'john', mode: 'insensitive' } },
                { primary_phone: { contains: 'john' } },
              ],
            },
          },
        }),
      }),
    );
  });

  it('filters by hasTenantNote=true (non-null and non-empty)', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { hasTenantNote: true },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    const call = findMany.mock.calls[0][0];
    expect(call.where.AND).toEqual(
      expect.arrayContaining([
        { tenant_note: { not: null } },
        { NOT: { tenant_note: '' } },
      ]),
    );
  });

  it('filters by hasTenantNote=false (null or empty)', async () => {
    const repo = new PrismaAppointmentRepository(prisma);

    await repo.findAll(
      { hasTenantNote: false },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    const call = findMany.mock.calls[0][0];
    expect(call.where.AND).toEqual(
      expect.arrayContaining([
        { OR: [{ tenant_note: null }, { tenant_note: '' }] },
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
