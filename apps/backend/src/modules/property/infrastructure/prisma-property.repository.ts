import type { PrismaClient } from '@prisma/client';
import type { PropertyType as PrismaPropertyType, GeocodingStatus as PrismaGeocodingStatus, Prisma } from '@prisma/client';
import { PropertyEntity } from '../domain/property.entity';
import { buildNormalizedAddressKey } from '../../../shared/domain/normalize-address';
import type {
  IPropertyRepository,
  PropertyFilters,
  PaginationParams,
  PropertyWithBranch,
} from '../domain/property.repository';
import type { PropertyType, GeocodingStatus } from '@properfy/shared';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function mapToEntity(row: {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  property_code: string;
  type: string;
  street: string;
  address_line_2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  lat: unknown;
  lng: unknown;
  geocoding_status: string;
  notes: string | null;
  rules_json: unknown;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}): PropertyEntity {
  return new PropertyEntity({
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    propertyCode: row.property_code,
    type: row.type as PropertyType,
    street: row.street,
    addressLine2: row.address_line_2,
    suburb: row.suburb,
    postcode: row.postcode,
    state: row.state,
    country: row.country,
    lat: row.lat ? Number(row.lat) : null,
    lng: row.lng ? Number(row.lng) : null,
    geocodingStatus: row.geocoding_status as GeocodingStatus,
    notes: row.notes,
    rulesJson: (row.rules_json as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PrismaPropertyRepository implements IPropertyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(
    id: string,
    tenantId?: string | null,
  ): Promise<PropertyEntity | null> {
    const where: Record<string, unknown> = { id, deleted_at: null };
    if (tenantId) where['tenant_id'] = tenantId;
    const row = await this.prisma.property.findFirst({ where });
    return row ? mapToEntity(row) : null;
  }

  async existsById(id: string): Promise<boolean> {
    // Intentionally ignores tenant scope and soft-delete: answers "does this row
    // exist in this database at all?" so the geocode worker can distinguish a
    // soft-deleted property from one absent entirely (wrong-database consumer).
    const count = await this.prisma.property.count({ where: { id } });
    return count > 0;
  }

  async findByIdWithBranch(
    id: string,
    tenantId?: string | null,
  ): Promise<PropertyWithBranch | null> {
    const where: Record<string, unknown> = { id, deleted_at: null };
    if (tenantId) where['tenant_id'] = tenantId;
    const row = await this.prisma.property.findFirst({
      where,
      include: { branch: { select: { name: true } } },
    });
    if (!row) return null;
    return { property: mapToEntity(row), branchName: row.branch?.name ?? null };
  }

  async findByPropertyCode(
    propertyCode: string,
    tenantId: string,
  ): Promise<PropertyEntity | null> {
    const row = await this.prisma.property.findFirst({
      where: {
        property_code: propertyCode,
        tenant_id: tenantId,
        deleted_at: null,
      },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByNormalizedAddress(
    tenantId: string,
    addr: { street: string; addressLine2: string | null; suburb: string; state: string; postcode: string },
  ): Promise<PropertyEntity | null> {
    const row = await this.prisma.property.findFirst({
      where: {
        tenant_id: tenantId,
        normalized_address_key: buildNormalizedAddressKey(addr),
        deleted_at: null,
      },
    });
    return row ? mapToEntity(row) : null;
  }

  async findManyByNormalizedAddressKeys(tenantId: string, keys: string[]): Promise<PropertyEntity[]> {
    if (keys.length === 0) return [];
    const rows = await this.prisma.property.findMany({
      where: {
        tenant_id: tenantId,
        normalized_address_key: { in: keys },
        deleted_at: null,
      },
    });
    return rows.map(mapToEntity);
  }

  async findAll(
    filters: PropertyFilters,
    pagination: PaginationParams,
  ): Promise<PropertyEntity[]> {
    if (filters.nearLocation) {
      return this.findAllWithSpatialFilter(filters, pagination);
    }
    const where = this.buildWhere(filters);
    const rows = await this.prisma.property.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [toSnakeCase(pagination.sortBy ?? 'created_at')]: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
  }

  async findAllWithBranch(
    filters: PropertyFilters,
    pagination: PaginationParams,
  ): Promise<PropertyWithBranch[]> {
    if (filters.nearLocation) {
      return this.findAllWithBranchSpatialFilter(filters, pagination);
    }
    const where = this.buildWhere(filters);
    const rows = await this.prisma.property.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { [toSnakeCase(pagination.sortBy ?? 'created_at')]: pagination.sortOrder },
      include: { branch: { select: { name: true } } },
    });
    return rows.map((row) => ({
      property: mapToEntity(row),
      branchName: row.branch?.name ?? null,
    }));
  }

  async count(filters: PropertyFilters): Promise<number> {
    if (filters.nearLocation) {
      return this.countWithSpatialFilter(filters);
    }
    const where = this.buildWhere(filters);
    return this.prisma.property.count({ where });
  }

  async save(property: PropertyEntity): Promise<void> {
    await this.prisma.property.create({
      data: {
        id: property.id,
        tenant_id: property.tenantId,
        branch_id: property.branchId,
        property_code: property.propertyCode,
        type: property.type as PrismaPropertyType,
        street: property.street,
        address_line_2: property.addressLine2,
        suburb: property.suburb,
        postcode: property.postcode,
        state: property.state,
        country: property.country,
        // normalized_address_key is intentionally omitted — a DB trigger
        // (see migration 20260701230009) always (re)computes it from the
        // row's own address fields on every insert/update.
        lat: property.lat,
        lng: property.lng,
        geocoding_status: property.geocodingStatus as PrismaGeocodingStatus,
        notes: property.notes,
        rules_json: property.rulesJson as Prisma.InputJsonValue,
      },
    });

    await this.syncCoordinates(property.id, property.lat, property.lng);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<{
      branchId: string | null;
      propertyCode: string;
      type: string;
      street: string;
      addressLine2: string | null;
      suburb: string;
      postcode: string;
      state: string;
      country: string;
      lat: number | null;
      lng: number | null;
      geocodingStatus: string;
      notes: string | null;
      rulesJson: Record<string, unknown>;
      deletedAt: Date | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.branchId !== undefined) updateData['branch_id'] = data.branchId;
    if (data.propertyCode !== undefined)
      updateData['property_code'] = data.propertyCode;
    if (data.type !== undefined) updateData['type'] = data.type;
    if (data.street !== undefined) updateData['street'] = data.street;
    if (data.addressLine2 !== undefined)
      updateData['address_line_2'] = data.addressLine2;
    if (data.suburb !== undefined) updateData['suburb'] = data.suburb;
    if (data.postcode !== undefined) updateData['postcode'] = data.postcode;
    if (data.state !== undefined) updateData['state'] = data.state;
    if (data.country !== undefined) updateData['country'] = data.country;
    if (data.lat !== undefined) updateData['lat'] = data.lat;
    if (data.lng !== undefined) updateData['lng'] = data.lng;
    if (data.geocodingStatus !== undefined)
      updateData['geocoding_status'] = data.geocodingStatus;
    if (data.notes !== undefined) updateData['notes'] = data.notes;
    if (data.rulesJson !== undefined)
      updateData['rules_json'] = data.rulesJson;
    if (data.deletedAt !== undefined)
      updateData['deleted_at'] = data.deletedAt;
    // normalized_address_key is intentionally never set here — the DB
    // trigger recomputes it from whatever address ends up in the row on
    // every UPDATE, so a partial address-field diff still lands correctly
    // without this repository needing to fetch-and-merge first.

    await this.prisma.property.updateMany({
      where: { id, tenant_id: tenantId },
      data: updateData,
    });

    if (data.lat !== undefined || data.lng !== undefined) {
      await this.syncCoordinates(id, data.lat ?? null, data.lng ?? null);
    }
  }

  async findFailedGeocoding(updatedBefore: Date): Promise<Array<{ id: string; tenantId: string }>> {
    const rows = await this.prisma.property.findMany({
      where: {
        geocoding_status: 'FAILED',
        updated_at: { lt: updatedBefore },
        deleted_at: null,
      },
      select: { id: true, tenant_id: true },
    });
    return rows.map((r) => ({ id: r.id, tenantId: r.tenant_id }));
  }

  async findStalePendingGeocoding(updatedBefore: Date): Promise<Array<{ id: string; tenantId: string }>> {
    const rows = await this.prisma.property.findMany({
      where: {
        geocoding_status: 'PENDING',
        lat: null,
        updated_at: { lt: updatedBefore },
        deleted_at: null,
      },
      select: { id: true, tenant_id: true },
    });
    return rows.map((r) => ({ id: r.id, tenantId: r.tenant_id }));
  }

  async countFailedGeocoding(): Promise<number> {
    return this.prisma.property.count({
      where: {
        geocoding_status: 'FAILED',
        deleted_at: null,
      },
    });
  }

  private buildWhere(filters: PropertyFilters) {
    const where: Record<string, unknown> = { deleted_at: null };
    if (filters.tenantId) where['tenant_id'] = filters.tenantId;
    if (filters.branchId) where['branch_id'] = filters.branchId;
    if (filters.type) where['type'] = filters.type;
    if (filters.hasCoordinates === true) {
      where['lat'] = { not: null };
      where['lng'] = { not: null };
    } else if (filters.hasCoordinates === false) {
      where['OR'] = [{ lat: null }, { lng: null }];
    }
    if (filters.search) {
      where['AND'] = [
        {
          OR: [
            { property_code: { contains: filters.search, mode: 'insensitive' } },
            { street: { contains: filters.search, mode: 'insensitive' } },
            { suburb: { contains: filters.search, mode: 'insensitive' } },
          ],
        },
      ];
    }
    return where;
  }

  private buildSpatialWhereClause(filters: PropertyFilters): { clause: string; params: unknown[] } {
    const conditions: string[] = ['p.deleted_at IS NULL'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.tenantId) {
      conditions.push(`p.tenant_id = $${paramIndex++}`);
      params.push(filters.tenantId);
    }
    if (filters.branchId) {
      conditions.push(`p.branch_id = $${paramIndex++}`);
      params.push(filters.branchId);
    }
    if (filters.type) {
      conditions.push(`p.type = $${paramIndex++}::"PropertyType"`);
      params.push(filters.type);
    }
    if (filters.hasCoordinates === true) {
      conditions.push('p.lat IS NOT NULL AND p.lng IS NOT NULL');
    } else if (filters.hasCoordinates === false) {
      conditions.push('(p.lat IS NULL OR p.lng IS NULL)');
    }
    if (filters.search) {
      const searchParam = `$${paramIndex++}`;
      conditions.push(
        `(p.property_code ILIKE ${searchParam} OR p.street ILIKE ${searchParam} OR p.suburb ILIKE ${searchParam})`,
      );
      params.push(`%${filters.search}%`);
    }
    if (filters.nearLocation) {
      const { lng, lat, radiusKm } = filters.nearLocation;
      const radiusMeters = radiusKm * 1000;
      conditions.push(
        `ST_DWithin(p.coordinates::geography, ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography, $${paramIndex++})`,
      );
      params.push(lng, lat, radiusMeters);
    }

    return { clause: conditions.join(' AND '), params };
  }

  private async findAllWithSpatialFilter(
    filters: PropertyFilters,
    pagination: PaginationParams,
  ): Promise<PropertyEntity[]> {
    const { clause, params } = this.buildSpatialWhereClause(filters);
    const offset = (pagination.page - 1) * pagination.pageSize;
    const sortCol = toSnakeCase(pagination.sortBy ?? 'created_at');
    const sortDir = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const paramIndex = params.length + 1;
    params.push(pagination.pageSize, offset);

    const sql = `
      SELECT p.id, p.tenant_id, p.branch_id, p.property_code, p.type,
             p.street, p.address_line_2, p.suburb, p.postcode, p.state, p.country,
             p.lat, p.lng, p.geocoding_status, p.notes, p.rules_json,
             p.created_at, p.updated_at, p.deleted_at
      FROM properties p
      WHERE ${clause}
      ORDER BY p.${sortCol} ${sortDir}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const rows: Array<{
      id: string; tenant_id: string; branch_id: string | null; property_code: string;
      type: string; street: string; address_line_2: string | null; suburb: string;
      postcode: string; state: string; country: string; lat: unknown; lng: unknown;
      geocoding_status: string; notes: string | null; rules_json: unknown;
      created_at: Date; updated_at: Date; deleted_at: Date | null;
    }> = await this.prisma.$queryRawUnsafe(sql, ...params);

    return rows.map(mapToEntity);
  }

  private async findAllWithBranchSpatialFilter(
    filters: PropertyFilters,
    pagination: PaginationParams,
  ): Promise<PropertyWithBranch[]> {
    const { clause, params } = this.buildSpatialWhereClause(filters);
    const offset = (pagination.page - 1) * pagination.pageSize;
    const sortCol = toSnakeCase(pagination.sortBy ?? 'created_at');
    const sortDir = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const paramIndex = params.length + 1;
    params.push(pagination.pageSize, offset);

    const sql = `
      SELECT p.id, p.tenant_id, p.branch_id, p.property_code, p.type,
             p.street, p.address_line_2, p.suburb, p.postcode, p.state, p.country,
             p.lat, p.lng, p.geocoding_status, p.notes, p.rules_json,
             p.created_at, p.updated_at, p.deleted_at,
             b.name AS branch_name
      FROM properties p
      LEFT JOIN branches b ON b.id = p.branch_id
      WHERE ${clause}
      ORDER BY p.${sortCol} ${sortDir}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const rows: Array<{
      id: string; tenant_id: string; branch_id: string | null; property_code: string;
      type: string; street: string; address_line_2: string | null; suburb: string;
      postcode: string; state: string; country: string; lat: unknown; lng: unknown;
      geocoding_status: string; notes: string | null; rules_json: unknown;
      created_at: Date; updated_at: Date; deleted_at: Date | null;
      branch_name: string | null;
    }> = await this.prisma.$queryRawUnsafe(sql, ...params);

    return rows.map((row) => ({
      property: mapToEntity(row),
      branchName: row.branch_name ?? null,
    }));
  }

  private async countWithSpatialFilter(filters: PropertyFilters): Promise<number> {
    const { clause, params } = this.buildSpatialWhereClause(filters);
    const sql = `SELECT COUNT(*)::int AS count FROM properties p WHERE ${clause}`;
    const result: Array<{ count: number }> = await this.prisma.$queryRawUnsafe(sql, ...params);
    return result[0]?.count ?? 0;
  }

  private async syncCoordinates(
    propertyId: string,
    lat: number | null | undefined,
    lng: number | null | undefined,
  ): Promise<void> {
    if (lat != null && lng != null) {
      await this.prisma.$executeRaw`
        UPDATE properties SET coordinates = ST_SetSRID(ST_MakePoint(${lng}::float, ${lat}::float), 4326)
        WHERE id = ${propertyId}
      `;
    } else {
      await this.prisma.$executeRaw`
        UPDATE properties SET coordinates = NULL
        WHERE id = ${propertyId}
      `;
    }
  }
}
