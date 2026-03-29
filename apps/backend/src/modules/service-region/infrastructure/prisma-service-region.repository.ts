import type { PrismaClient } from '@prisma/client';
import { RegionStatus as PrismaRegionStatus } from '@prisma/client';
import { ServiceRegionEntity } from '../domain/service-region.entity';
import type {
  IServiceRegionRepository,
  ServiceRegionFilters,
  PaginationParams,
} from '../domain/service-region.repository';
import type { RegionStatus, SuburbStatus } from '@properfy/shared';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

interface SuburbRow {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  postcode: string | null;
  status: string;
  created_at: Date;
}

interface RegionRow {
  id: string;
  name: string;
  state: string;
  country: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  region_suburbs: Array<{ suburb: SuburbRow }>;
}

function mapToEntity(row: RegionRow): ServiceRegionEntity {
  return new ServiceRegionEntity({
    id: row.id,
    name: row.name,
    state: row.state,
    country: row.country,
    status: row.status as RegionStatus,
    suburbs: row.region_suburbs.map((rs) => ({
      id: rs.suburb.id,
      name: rs.suburb.name,
      city: rs.suburb.city,
      state: rs.suburb.state,
      country: rs.suburb.country,
      postcode: rs.suburb.postcode,
      status: rs.suburb.status as SuburbStatus,
      createdAt: rs.suburb.created_at,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const includeSuburbs = {
  region_suburbs: {
    include: {
      suburb: true,
    },
  },
} as const;

export class PrismaServiceRegionRepository implements IServiceRegionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ServiceRegionEntity | null> {
    const row = await this.prisma.serviceRegion.findFirst({
      where: { id },
      include: includeSuburbs,
    });
    return row ? mapToEntity(row) : null;
  }

  async findAll(
    filters: ServiceRegionFilters,
    pagination: PaginationParams,
  ): Promise<ServiceRegionEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.serviceRegion.findMany({
      where,
      include: includeSuburbs,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [toSnakeCase(pagination.sortBy ?? 'created_at')]: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
  }

  async count(filters: ServiceRegionFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.serviceRegion.count({ where });
  }

  async save(region: ServiceRegionEntity): Promise<void> {
    await this.prisma.serviceRegion.create({
      data: {
        id: region.id,
        name: region.name,
        state: region.state,
        country: region.country,
        status: region.status as PrismaRegionStatus,
        region_suburbs: {
          create: region.suburbs.map((s) => ({
            suburb_id: s.id,
          })),
        },
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      status: string;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.status !== undefined) updateData['status'] = data.status;
    await this.prisma.serviceRegion.update({ where: { id }, data: updateData });
  }

  async addSuburbs(regionId: string, suburbIds: string[]): Promise<void> {
    if (suburbIds.length === 0) return;
    await this.prisma.regionSuburb.createMany({
      data: suburbIds.map((suburbId) => ({
        region_id: regionId,
        suburb_id: suburbId,
      })),
      skipDuplicates: true,
    });
  }

  async removeSuburbs(regionId: string, suburbIds: string[]): Promise<void> {
    if (suburbIds.length === 0) return;
    await this.prisma.regionSuburb.deleteMany({
      where: {
        region_id: regionId,
        suburb_id: { in: suburbIds },
      },
    });
  }

  private buildWhere(filters: ServiceRegionFilters) {
    const where: Record<string, unknown> = {};
    if (filters.country) where['country'] = filters.country;
    if (filters.state) where['state'] = filters.state;
    if (filters.status) where['status'] = filters.status;
    if (filters.search) {
      where['OR'] = [
        { name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
