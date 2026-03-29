import type { PrismaClient } from '@prisma/client';
import { RegionStatus as PrismaRegionStatus } from '@prisma/client';
import { ServiceRegionEntity } from '../domain/service-region.entity';
import type {
  IServiceRegionRepository,
  ServiceRegionFilters,
  PaginationParams,
} from '../domain/service-region.repository';
import type { RegionStatus } from '@properfy/shared';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

interface RegionRow {
  id: string;
  name: string;
  geojson: unknown;
  color: string;
  status: string;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapToEntity(row: RegionRow): ServiceRegionEntity {
  return new ServiceRegionEntity({
    id: row.id,
    name: row.name,
    geojson: (row.geojson as Record<string, unknown>) ?? {},
    color: row.color,
    status: row.status as RegionStatus,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaServiceRegionRepository implements IServiceRegionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ServiceRegionEntity | null> {
    const row = await this.prisma.serviceRegion.findUnique({ where: { id } });
    return row ? mapToEntity(row) : null;
  }

  async findAll(
    filters: ServiceRegionFilters,
    pagination: PaginationParams,
  ): Promise<ServiceRegionEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.serviceRegion.findMany({
      where,
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
    const geojsonStr = JSON.stringify(region.geojson);
    await this.prisma.$executeRaw`
      INSERT INTO service_regions (id, name, geom, geojson, color, status, created_by_user_id, created_at, updated_at)
      VALUES (
        ${region.id},
        ${region.name},
        ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326),
        ${geojsonStr}::jsonb,
        ${region.color},
        'ACTIVE',
        ${region.createdByUserId},
        NOW(),
        NOW()
      )
    `;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      geojson: Record<string, unknown>;
      color: string;
      status: string;
    }>,
  ): Promise<void> {
    if (data.geojson) {
      const geojsonStr = JSON.stringify(data.geojson);
      await this.prisma.$executeRaw`
        UPDATE service_regions SET
          name = COALESCE(${data.name ?? null}, name),
          geom = ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326),
          geojson = ${geojsonStr}::jsonb,
          color = COALESCE(${data.color ?? null}, color),
          status = COALESCE(${data.status ?? null}::"RegionStatus", status),
          updated_at = NOW()
        WHERE id = ${id}
      `;
    } else {
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData['name'] = data.name;
      if (data.color !== undefined) updateData['color'] = data.color;
      if (data.status !== undefined) updateData['status'] = data.status;
      await this.prisma.serviceRegion.update({
        where: { id },
        data: updateData,
      });
    }
  }

  async findPropertyIdsInInspectorRegions(inspectorId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT p.id
      FROM properties p
      JOIN service_regions sr ON ST_Contains(sr.geom, p.coordinates)
      JOIN inspector_regions ir ON ir.region_id = sr.id
      WHERE ir.inspector_id = ${inspectorId}
        AND sr.status = 'ACTIVE'
        AND p.deleted_at IS NULL
        AND p.coordinates IS NOT NULL
    `;
    return rows.map((r) => r.id);
  }

  async setInspectorRegions(inspectorId: string, regionIds: string[]): Promise<void> {
    await this.prisma.inspectorRegion.deleteMany({
      where: { inspector_id: inspectorId },
    });
    if (regionIds.length > 0) {
      await this.prisma.inspectorRegion.createMany({
        data: regionIds.map((regionId) => ({
          inspector_id: inspectorId,
          region_id: regionId,
        })),
        skipDuplicates: true,
      });
    }
  }

  async getInspectorRegionIds(inspectorId: string): Promise<string[]> {
    const rows = await this.prisma.inspectorRegion.findMany({
      where: { inspector_id: inspectorId },
      select: { region_id: true },
    });
    return rows.map((r) => r.region_id);
  }

  async getInspectorRegionIdsBatch(inspectorIds: string[]): Promise<Map<string, string[]>> {
    if (inspectorIds.length === 0) return new Map();
    const rows = await this.prisma.inspectorRegion.findMany({
      where: { inspector_id: { in: inspectorIds } },
      select: { inspector_id: true, region_id: true },
    });
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const existing = map.get(row.inspector_id) ?? [];
      existing.push(row.region_id);
      map.set(row.inspector_id, existing);
    }
    return map;
  }

  private buildWhere(filters: ServiceRegionFilters) {
    const where: Record<string, unknown> = {};
    if (filters.status) where['status'] = filters.status;
    if (filters.search) {
      where['OR'] = [
        { name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
