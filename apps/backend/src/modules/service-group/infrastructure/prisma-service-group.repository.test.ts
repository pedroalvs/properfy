import { describe, expect, it, vi } from 'vitest';
import { PrismaServiceGroupRepository } from './prisma-service-group.repository';

describe('PrismaServiceGroupRepository marketplace filters', () => {
  it('applies suburb_ref join filtering in the database query for marketplace offers', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      serviceGroup: {
        findMany,
        count: vi.fn(),
      },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    await repo.findPublishedForInspector(
      'inspector-1',
      ['st-1'],
      ['tenant-1'],
      { page: 1, pageSize: 20, sortOrder: 'asc' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          appointments: {
            some: {
              property: {
                suburb_ref: {
                  status: 'ACTIVE',
                  region_suburbs: {
                    some: {
                      region: {
                        status: 'ACTIVE',
                        inspector_regions: {
                          some: { inspector_id: 'inspector-1' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      }),
    );
  });

  it('uses the same suburb_ref join filter when counting marketplace offers', async () => {
    const count = vi.fn().mockResolvedValue(3);
    const prisma = {
      serviceGroup: {
        findMany: vi.fn(),
        count,
      },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    await repo.countPublishedForInspector(
      'inspector-1',
      ['st-1'],
      ['tenant-1'],
    );

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        appointments: {
          some: {
            property: {
              suburb_ref: {
                status: 'ACTIVE',
                region_suburbs: {
                  some: {
                    region: {
                      status: 'ACTIVE',
                      inspector_regions: {
                        some: { inspector_id: 'inspector-1' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });
  });

  it('returns early when the inspector has no eligible service types', async () => {
    const prisma = {
      serviceGroup: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    await expect(
      repo.findPublishedForInspector('inspector-1', [], ['tenant-1'], {
        page: 1,
        pageSize: 20,
        sortOrder: 'asc',
      }),
    ).resolves.toEqual([]);
    await expect(
      repo.countPublishedForInspector('inspector-1', [], ['tenant-1']),
    ).resolves.toBe(0);
    expect(prisma.serviceGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.serviceGroup.count).not.toHaveBeenCalled();
  });
});
