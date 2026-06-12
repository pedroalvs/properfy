import type { PrismaClient } from '@prisma/client';
import { ServiceRegionEntity } from '../domain/service-region.entity';
import type {
  IServiceRegionRepository,
  ServiceRegionFilters,
  PaginationParams,
  ResolvedRegion,
} from '../domain/service-region.repository';
import type { RegionStatus } from '@properfy/shared';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

interface RegionRow {
  id: string;
  tenant_id: string | null;
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
    tenantId: row.tenant_id,
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

  async findById(id: string, tenantId: string | null): Promise<ServiceRegionEntity | null> {
    const where: Record<string, unknown> = { id };
    if (tenantId) where['tenant_id'] = tenantId;
    const row = await this.prisma.serviceRegion.findFirst({ where });
    return row ? mapToEntity(row) : null;
  }

  async findByName(tenantId: string | null, name: string): Promise<ServiceRegionEntity | null> {
    const where: Record<string, unknown> = {
      name: { equals: name, mode: 'insensitive' },
    };
    if (tenantId) {
      where['tenant_id'] = tenantId;
    } else {
      where['tenant_id'] = null;
    }
    const row = await this.prisma.serviceRegion.findFirst({ where });
    return row ? mapToEntity(row) : null;
  }

  async findAll(
    tenantId: string | null,
    filters: ServiceRegionFilters,
    pagination: PaginationParams,
  ): Promise<ServiceRegionEntity[]> {
    const where = this.buildWhere(tenantId, filters);
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

  async count(tenantId: string | null, filters: ServiceRegionFilters): Promise<number> {
    const where = this.buildWhere(tenantId, filters);
    return this.prisma.serviceRegion.count({ where });
  }

  async save(region: ServiceRegionEntity): Promise<void> {
    const geojsonStr = JSON.stringify(region.geojson);
    await this.prisma.$executeRaw`
      INSERT INTO service_regions (id, tenant_id, name, geom, geojson, color, status, created_by_user_id, created_at, updated_at)
      VALUES (
        ${region.id},
        ${region.tenantId},
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
    tenantId: string | null,
    data: Partial<{
      name: string;
      geojson: Record<string, unknown>;
      color: string;
      status: string;
    }>,
  ): Promise<void> {
    if (data.geojson) {
      const geojsonStr = JSON.stringify(data.geojson);
      if (tenantId === null) {
        await this.prisma.$executeRaw`
          UPDATE service_regions SET
            name = COALESCE(${data.name ?? null}, name),
            geom = ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326),
            geojson = ${geojsonStr}::jsonb,
            color = COALESCE(${data.color ?? null}, color),
            status = COALESCE(${data.status ?? null}::"RegionStatus", status),
            updated_at = NOW()
          WHERE id = ${id} AND tenant_id IS NULL
        `;
      } else {
        await this.prisma.$executeRaw`
          UPDATE service_regions SET
            name = COALESCE(${data.name ?? null}, name),
            geom = ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326),
            geojson = ${geojsonStr}::jsonb,
            color = COALESCE(${data.color ?? null}, color),
            status = COALESCE(${data.status ?? null}::"RegionStatus", status),
            updated_at = NOW()
          WHERE id = ${id} AND tenant_id = ${tenantId}
        `;
      }
    } else {
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData['name'] = data.name;
      if (data.color !== undefined) updateData['color'] = data.color;
      if (data.status !== undefined) updateData['status'] = data.status;
      await this.prisma.serviceRegion.updateMany({
        where: { id, tenant_id: tenantId === null ? { equals: null } : tenantId },
        data: updateData,
      });
    }
  }

  async findPropertyIdsInInspectorRegions(inspectorId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT p.id
      FROM properties p
      JOIN service_regions sr ON ST_Intersects(sr.geom, p.coordinates)
      JOIN inspector_regions ir ON ir.region_id = sr.id
      WHERE ir.inspector_id = ${inspectorId}
        AND sr.status = 'ACTIVE'
        AND p.deleted_at IS NULL
        AND p.coordinates IS NOT NULL
    `;
    return rows.map((r) => r.id);
  }

  async resolveRegionsForAppointments(tenantId: string, appointmentIds: string[]): Promise<ResolvedRegion[]> {
    if (appointmentIds.length === 0) return [];

    const rows = await this.prisma.$queryRaw<
      Array<{ region_id: string; region_name: string; color: string; matched_appointment_ids: string[] }>
    >`
      SELECT sr.id AS region_id, sr.name AS region_name, sr.color,
             array_agg(DISTINCT a.id) AS matched_appointment_ids
      FROM service_regions sr
      JOIN properties p ON ST_Intersects(sr.geom, p.coordinates)
      JOIN appointments a ON a.property_id = p.id
      WHERE a.id = ANY(${appointmentIds}::text[])
        AND (sr.tenant_id = ${tenantId} OR sr.tenant_id IS NULL)
        AND sr.status = 'ACTIVE'
        AND sr.geom IS NOT NULL
        AND p.coordinates IS NOT NULL
        AND p.deleted_at IS NULL
        AND a.deleted_at IS NULL
      GROUP BY sr.id, sr.name, sr.color
      ORDER BY COUNT(DISTINCT a.id) DESC
    `;

    return rows.map((r) => ({
      regionId: r.region_id,
      regionName: r.region_name,
      color: r.color,
      matchedAppointmentIds: r.matched_appointment_ids,
    }));
  }

  async findContainingPoint(tenantId: string, lat: number, lng: number): Promise<ServiceRegionEntity[]> {
    const rows = await this.prisma.$queryRaw<RegionRow[]>`
      SELECT id, tenant_id, name, geojson, color, status::text, created_by_user_id, created_at, updated_at
      FROM service_regions
      WHERE tenant_id = ${tenantId}
        AND status = 'ACTIVE'
        AND geom IS NOT NULL
        AND ST_Intersects(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
      ORDER BY name
    `;
    return rows.map(mapToEntity);
  }

  async countActiveInspectorsInRegion(regionId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT ir.inspector_id) AS count
      FROM inspector_regions ir
      JOIN inspectors i ON i.id = ir.inspector_id
      WHERE ir.region_id = ${regionId}
        AND i.status = 'ACTIVE'
    `;
    return Number(rows[0]?.count ?? 0);
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

  async delete(id: string, tenantId: string | null): Promise<void> {
    await this.prisma.inspectorRegion.deleteMany({ where: { region_id: id } });
    if (tenantId) {
      await this.prisma.$executeRaw`DELETE FROM service_regions WHERE id = ${id} AND tenant_id = ${tenantId}`;
    } else {
      await this.prisma.$executeRaw`DELETE FROM service_regions WHERE id = ${id} AND tenant_id IS NULL`;
    }
  }

  async findAllByInspector(
    inspectorId: string,
    tenantId: string,
    filters: ServiceRegionFilters,
    pagination: PaginationParams,
  ): Promise<ServiceRegionEntity[]> {
    const assignments = await this.prisma.inspectorRegion.findMany({
      where: { inspector_id: inspectorId },
      select: { region_id: true },
    });
    const regionIds = assignments.map((a) => a.region_id);
    if (regionIds.length === 0) return [];

    const where = this.buildInspectorWhere(regionIds, tenantId, filters);
    const rows = await this.prisma.serviceRegion.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { [toSnakeCase(pagination.sortBy ?? 'name')]: pagination.sortOrder },
    });
    return rows.map(mapToEntity);
  }

  async countByInspector(
    inspectorId: string,
    tenantId: string,
    filters: ServiceRegionFilters,
  ): Promise<number> {
    const assignments = await this.prisma.inspectorRegion.findMany({
      where: { inspector_id: inspectorId },
      select: { region_id: true },
    });
    const regionIds = assignments.map((a) => a.region_id);
    if (regionIds.length === 0) return 0;

    const where = this.buildInspectorWhere(regionIds, tenantId, filters);
    return this.prisma.serviceRegion.count({ where });
  }

  async countPublishedGroupsByRegionId(regionId: string): Promise<number> {
    return this.prisma.serviceGroup.count({
      where: {
        service_region_id: regionId,
        status: 'PUBLISHED',
      },
    });
  }

  private buildInspectorWhere(
    regionIds: string[],
    tenantId: string,
    filters: ServiceRegionFilters,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {
      id: { in: regionIds },
      tenant_id: tenantId,
    };
    if (filters.status) where['status'] = filters.status;
    if (filters.search) {
      where['OR'] = [{ name: { contains: filters.search, mode: 'insensitive' } }];
    }
    return where;
  }

  private buildWhere(tenantId: string | null, filters: ServiceRegionFilters) {
    const where: Record<string, unknown> = {};
    // Honour the per-role tenant scope. When the caller is cross-tenant (AM)
    // and no filter is provided, omit tenant_id to return all tenants.
    const effectiveTenant = tenantId ?? filters.tenantId ?? null;
    if (effectiveTenant) where['tenant_id'] = effectiveTenant;
    if (filters.status) where['status'] = filters.status;
    if (filters.search) {
      where['OR'] = [
        { name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
