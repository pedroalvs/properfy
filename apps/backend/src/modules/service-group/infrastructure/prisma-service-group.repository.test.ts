import { describe, expect, it, vi } from 'vitest';
import { PrismaServiceGroupRepository } from './prisma-service-group.repository';

describe('PrismaServiceGroupRepository marketplace filters', () => {
  it('applies suburb filtering in the database query for marketplace offers', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      serviceGroup: {
        findMany,
        count: vi.fn(),
      },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    await repo.findPublishedForInspector(
      ['st-1'],
      ['Centro'],
      ['tenant-1'],
      { page: 1, pageSize: 20, sortOrder: 'asc' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          appointments: {
            some: {
              property: {
                suburb: { in: ['Centro'] },
              },
            },
          },
        }),
      }),
    );
  });

  it('uses the same suburb filter when counting marketplace offers', async () => {
    const count = vi.fn().mockResolvedValue(3);
    const prisma = {
      serviceGroup: {
        findMany: vi.fn(),
        count,
      },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    await repo.countPublishedForInspector(
      ['st-1'],
      ['Centro'],
      ['tenant-1'],
    );

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        appointments: {
          some: {
            property: {
              suburb: { in: ['Centro'] },
            },
          },
        },
      }),
    });
  });

  it('returns early when the inspector has no eligible regions', async () => {
    const prisma = {
      serviceGroup: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    await expect(
      repo.findPublishedForInspector(['st-1'], [], ['tenant-1'], {
        page: 1,
        pageSize: 20,
        sortOrder: 'asc',
      }),
    ).resolves.toEqual([]);
    await expect(
      repo.countPublishedForInspector(['st-1'], [], ['tenant-1']),
    ).resolves.toBe(0);
    expect(prisma.serviceGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.serviceGroup.count).not.toHaveBeenCalled();
  });
});
