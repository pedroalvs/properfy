import { describe, expect, it, vi } from 'vitest';
import { PrismaServiceGroupRepository } from './prisma-service-group.repository';
import type { IServiceRegionRepository } from '../../service-region/domain/service-region.repository';

function createMockServiceRegionRepo(propertyIds: string[]): IServiceRegionRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    findPropertyIdsInInspectorRegions: vi.fn().mockResolvedValue(propertyIds),
    setInspectorRegions: vi.fn(),
  };
}

describe('PrismaServiceGroupRepository marketplace filters', () => {
  it('uses PostGIS spatial query to find property IDs for marketplace offers', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      serviceGroup: {
        findMany,
        count: vi.fn(),
      },
    };

    const serviceRegionRepo = createMockServiceRegionRepo(['prop-1', 'prop-2']);
    const repo = new PrismaServiceGroupRepository(prisma as any, serviceRegionRepo);

    await repo.findPublishedForInspector(
      'inspector-1',
      ['st-1'],
      ['tenant-1'],
      { page: 1, pageSize: 20, sortOrder: 'asc' },
    );

    expect(serviceRegionRepo.findPropertyIdsInInspectorRegions).toHaveBeenCalledWith('inspector-1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          appointments: {
            some: {
              property_id: { in: ['prop-1', 'prop-2'] },
            },
          },
        }),
      }),
    );
  });

  it('returns empty when no properties found in inspector regions', async () => {
    const findMany = vi.fn();
    const prisma = {
      serviceGroup: {
        findMany,
        count: vi.fn(),
      },
    };

    const serviceRegionRepo = createMockServiceRegionRepo([]);
    const repo = new PrismaServiceGroupRepository(prisma as any, serviceRegionRepo);

    const result = await repo.findPublishedForInspector(
      'inspector-1',
      ['st-1'],
      ['tenant-1'],
      { page: 1, pageSize: 20, sortOrder: 'asc' },
    );

    expect(result).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns 0 count when no properties found in inspector regions', async () => {
    const count = vi.fn();
    const prisma = {
      serviceGroup: {
        findMany: vi.fn(),
        count,
      },
    };

    const serviceRegionRepo = createMockServiceRegionRepo([]);
    const repo = new PrismaServiceGroupRepository(prisma as any, serviceRegionRepo);

    const result = await repo.countPublishedForInspector(
      'inspector-1',
      ['st-1'],
      ['tenant-1'],
    );

    expect(result).toBe(0);
    expect(count).not.toHaveBeenCalled();
  });

  it('returns early when the inspector has no eligible service types', async () => {
    const prisma = {
      serviceGroup: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    const serviceRegionRepo = createMockServiceRegionRepo(['prop-1']);
    const repo = new PrismaServiceGroupRepository(prisma as any, serviceRegionRepo);

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
