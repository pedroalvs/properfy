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
});
