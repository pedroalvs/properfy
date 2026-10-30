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
import type {
  ILegacyRegeocodeRepository,
  ImportPreviewRow,
  LegacyBranchCandidate,
  LegacyCoordinateCandidate,
  ManualWithTransitionAudit,
} from '../domain/legacy-regeocode.repository';
import type { PropertyType, GeocodingStatus } from '@properfy/shared';
import { PropertyCodeConflictError, PropertyAddressConflictError } from '../domain/property.errors';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Translates a unique-constraint violation (Prisma P2002) into the matching
 * domain conflict error — a backstop for the race window the use-case-level
 * pre-checks (findByPropertyCode / findByNormalizedAddress) leave open,
 * mirroring PrismaTenantRepository's rethrowPrefixConflict. Verified against
 * a real Postgres error (see property-normalized-address.integration.test.ts):
 * `target` is an array of column names — `["tenant_id", "normalized_address_key"]`
 * for the address index, `["tenant_id", "property_code"]` for the code one —
 * even for the partial unique index created outside Prisma's own `@@unique`.
 */
function rethrowPropertyConflict(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002') {
    const target = (error as { meta?: { target?: unknown } }).meta?.target;
    if (Array.isArray(target) && target.includes('normalized_address_key')) {
      throw new PropertyAddressConflictError();
    }
    if (
      Array.isArray(target) &&
      (target.includes('property_code') || target.includes('property_number'))
    ) {
      throw new PropertyCodeConflictError();
    }
  }
  throw error;
}

function mapToEntity(row: {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  property_code: string;
  property_number?: number | null;
  type: string;
  apartment_number?: string | null;
  street: string;
  address_line_2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  lat: unknown;
  lng: unknown;
  geocoding_status: string;
  geocoded_permanently_at?: Date | null;
  geocoding_failure_code?: string | null;
  private_area_m2?: unknown;
  total_area_m2?: unknown;
  furnished?: boolean | null;
  linen_provided?: boolean | null;
  rent_amount?: unknown;
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
    propertyNumber: row.property_number ?? null,
    type: row.type as PropertyType,
    apartmentNumber: row.apartment_number ?? null,
    street: row.street,
    addressLine2: row.address_line_2,
    suburb: row.suburb,
    postcode: row.postcode,
    state: row.state,
    country: row.country,
    lat: row.lat ? Number(row.lat) : null,
    lng: row.lng ? Number(row.lng) : null,
    geocodingStatus: row.geocoding_status as GeocodingStatus,
    geocodedPermanentlyAt: row.geocoded_permanently_at ?? null,
    geocodingFailureCode: row.geocoding_failure_code ?? null,
    privateAreaM2: row.private_area_m2 != null ? Number(row.private_area_m2) : null,
    totalAreaM2: row.total_area_m2 != null ? Number(row.total_area_m2) : null,
    furnished: row.furnished ?? null,
    linenProvided: row.linen_provided ?? null,
    rentAmount: row.rent_amount != null ? Number(row.rent_amount) : null,
    notes: row.notes,
    rulesJson: (row.rules_json as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PrismaPropertyRepository
  implements IPropertyRepository, ILegacyRegeocodeRepository
{
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
      include: { branch: { select: { name: true } }, tenant: { select: { name: true } } },
    });
    if (!row) return null;
    return {
      property: mapToEntity(row),
      branchName: row.branch?.name ?? null,
      tenantName: row.tenant?.name ?? null,
    };
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
      include: { branch: { select: { name: true } }, tenant: { select: { name: true } } },
    });
    return rows.map((row) => ({
      property: mapToEntity(row),
      branchName: row.branch?.name ?? null,
      tenantName: row.tenant?.name ?? null,
    }));
  }

  async count(filters: PropertyFilters): Promise<number> {
    if (filters.nearLocation) {
      return this.countWithSpatialFilter(filters);
    }
    const where = this.buildWhere(filters);
    return this.prisma.property.count({ where });
  }

  async countByType(
    filters: Pick<PropertyFilters, 'tenantId' | 'branchId' | 'search'>,
  ): Promise<Record<string, number>> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.property.groupBy({
      by: ['type'],
      where,
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((row) => [row.type, row._count._all]));
  }

  async nextPropertyNumber(tenantId: string): Promise<number> {
    // No deleted_at filter on purpose: numbers behind soft-deleted rows must
    // never be reissued, or a future code would collide with a historical one.
    const result = await this.prisma.property.aggregate({
      where: { tenant_id: tenantId },
      _max: { property_number: true },
    });
    return (result._max.property_number ?? 0) + 1;
  }

  async save(property: PropertyEntity): Promise<void> {
    try {
      await this.prisma.property.create({
        data: {
          id: property.id,
          tenant_id: property.tenantId,
          branch_id: property.branchId,
          property_code: property.propertyCode,
          property_number: property.propertyNumber,
          type: property.type as PrismaPropertyType,
          apartment_number: property.apartmentNumber,
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
          geocoded_permanently_at: property.geocodedPermanentlyAt,
          geocoding_failure_code: property.geocodingFailureCode,
          private_area_m2: property.privateAreaM2,
          total_area_m2: property.totalAreaM2,
          furnished: property.furnished,
          linen_provided: property.linenProvided,
          rent_amount: property.rentAmount,
          notes: property.notes,
          rules_json: property.rulesJson as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      rethrowPropertyConflict(error);
    }

    await this.syncCoordinates(property.id, property.lat, property.lng);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<{
      branchId: string | null;
      propertyCode: string;
      type: string;
      apartmentNumber: string | null;
      street: string;
      addressLine2: string | null;
      suburb: string;
      postcode: string;
      state: string;
      country: string;
      lat: number | null;
      lng: number | null;
      geocodingStatus: string;
      geocodedPermanentlyAt: Date | null;
      geocodingFailureCode: string | null;
      privateAreaM2: number | null;
      totalAreaM2: number | null;
      furnished: boolean | null;
      linenProvided: boolean | null;
      rentAmount: number | null;
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
    if (data.apartmentNumber !== undefined)
      updateData['apartment_number'] = data.apartmentNumber;
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
    if (data.geocodedPermanentlyAt !== undefined)
      updateData['geocoded_permanently_at'] = data.geocodedPermanentlyAt;
    if (data.geocodingFailureCode !== undefined)
      updateData['geocoding_failure_code'] = data.geocodingFailureCode;
    if (data.privateAreaM2 !== undefined) updateData['private_area_m2'] = data.privateAreaM2;
    if (data.totalAreaM2 !== undefined) updateData['total_area_m2'] = data.totalAreaM2;
    if (data.furnished !== undefined) updateData['furnished'] = data.furnished;
    if (data.linenProvided !== undefined) updateData['linen_provided'] = data.linenProvided;
    if (data.rentAmount !== undefined) updateData['rent_amount'] = data.rentAmount;
    if (data.notes !== undefined) updateData['notes'] = data.notes;
    if (data.rulesJson !== undefined)
      updateData['rules_json'] = data.rulesJson;
    if (data.deletedAt !== undefined)
      updateData['deleted_at'] = data.deletedAt;
    // normalized_address_key is intentionally never set here — the DB
    // trigger recomputes it from whatever address ends up in the row on
    // every UPDATE, so a partial address-field diff still lands correctly
    // without this repository needing to fetch-and-merge first.

    let updatedCount = 0;
    try {
      const result = await this.prisma.property.updateMany({
        where: { id, tenant_id: tenantId },
        data: updateData,
      });
      updatedCount = result.count;
    } catch (error) {
      rethrowPropertyConflict(error);
    }

    // syncCoordinates writes by id alone (no tenant_id in its WHERE — see
    // below), so it must never run when the tenant-scoped updateMany above
    // matched nothing: otherwise a property id belonging to a different
    // tenant than `tenantId` would still get its coordinates overwritten.
    if (updatedCount > 0 && (data.lat !== undefined || data.lng !== undefined)) {
      await this.syncCoordinates(id, data.lat ?? null, data.lng ?? null);
    }
  }

  async findFailedGeocoding(updatedBefore: Date): Promise<Array<{ id: string; tenantId: string }>> {
    const rows = await this.prisma.property.findMany({
      where: {
        geocoding_status: 'FAILED',
        // Never re-enqueue a FAILED that carries a failure code: those are
        // blocked (e.g. the account lacks permanent geocoding), so retrying
        // would re-pay a billable request per property per day forever.
        geocoding_failure_code: null,
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

  async countBlockedFailedGeocoding(): Promise<number> {
    return this.prisma.property.count({
      where: {
        geocoding_status: 'FAILED',
        geocoding_failure_code: { not: null },
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
      SELECT p.id, p.tenant_id, p.branch_id, p.property_code, p.property_number, p.type, p.apartment_number,
             p.street, p.address_line_2, p.suburb, p.postcode, p.state, p.country,
             p.lat, p.lng, p.geocoding_status,
             p.private_area_m2, p.total_area_m2, p.furnished, p.linen_provided, p.rent_amount,
             p.notes, p.rules_json,
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
      SELECT p.id, p.tenant_id, p.branch_id, p.property_code, p.property_number, p.type, p.apartment_number,
             p.street, p.address_line_2, p.suburb, p.postcode, p.state, p.country,
             p.lat, p.lng, p.geocoding_status,
             p.private_area_m2, p.total_area_m2, p.furnished, p.linen_provided, p.rent_amount,
             p.notes, p.rules_json,
             p.created_at, p.updated_at, p.deleted_at,
             b.name AS branch_name,
             t.name AS tenant_name
      FROM properties p
      LEFT JOIN branches b ON b.id = p.branch_id
      JOIN tenants t ON t.id = p.tenant_id
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
      tenant_name: string | null;
    }> = await this.prisma.$queryRawUnsafe(sql, ...params);

    return rows.map((row) => ({
      property: mapToEntity(row),
      branchName: row.branch_name ?? null,
      tenantName: row.tenant_name ?? null,
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

  // --- ILegacyRegeocodeRepository (TASK-X02-2, scripts/regeocode-permanent.ts) ---

  async findLegacyCoordinateCandidates(
    cursor: string | null,
    limit: number,
    tenantId?: string | null,
  ): Promise<LegacyCoordinateCandidate[]> {
    const rows = await this.prisma.property.findMany({
      where: {
        deleted_at: null,
        lat: { not: null },
        geocoding_status: { not: 'MANUAL' as PrismaGeocodingStatus },
        geocoded_permanently_at: null,
        OR: [
          { geocoding_failure_code: null },
          { geocoding_failure_code: { not: 'LEGACY_PERMANENT_NO_RESULT' } },
        ],
        ...(tenantId ? { tenant_id: tenantId } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true, tenant_id: true, property_code: true, lat: true, lng: true,
        street: true, address_line_2: true, suburb: true, state: true, postcode: true,
        country: true, updated_at: true,
      },
      orderBy: { id: 'asc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      propertyCode: r.property_code,
      lat: Number(r.lat),
      lng: Number(r.lng),
      street: r.street,
      addressLine2: r.address_line_2,
      suburb: r.suburb,
      state: r.state,
      postcode: r.postcode,
      country: r.country,
      updatedAt: r.updated_at,
    }));
  }

  async findLegacyBranchCandidates(
    cursor: string | null,
    limit: number,
    tenantId?: string | null,
  ): Promise<LegacyBranchCandidate[]> {
    const conditions = [
      'deleted_at IS NULL',
      'geocoded_permanently_at IS NULL',
      "address_json ? 'latitude'",
    ];
    const params: unknown[] = [];
    let i = 1;
    if (tenantId) {
      conditions.push(`tenant_id = $${i++}`);
      params.push(tenantId);
    }
    if (cursor) {
      conditions.push(`id > $${i++}`);
      params.push(cursor);
    }
    params.push(limit);
    const sql = `
      SELECT id, tenant_id, name, address_json, updated_at
      FROM branches
      WHERE ${conditions.join(' AND ')}
      ORDER BY id ASC
      LIMIT $${i}
    `;
    const rows: Array<{
      id: string; tenant_id: string; name: string;
      address_json: Record<string, unknown> | null; updated_at: Date;
    }> = await this.prisma.$queryRawUnsafe(sql, ...params);
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      name: r.name,
      addressJson: r.address_json ?? {},
      updatedAt: r.updated_at,
    }));
  }

  async findManualWithTransitionAudit(
    cursor: string | null,
    limit: number,
    tenantId?: string | null,
  ): Promise<ManualWithTransitionAudit[]> {
    const params: unknown[] = [];
    let i = 1;
    const tenantParam = tenantId ? `$${i++}` : null;
    if (tenantId) params.push(tenantId);
    const cursorParam = cursor ? `$${i++}` : null;
    if (cursor) params.push(cursor);
    params.push(limit);
    const limitParam = `$${i}`;
    const sql = `
      WITH manual_props AS (
        SELECT id, tenant_id, property_code, lat, lng, updated_at,
               street, address_line_2, suburb, state, postcode, country
        FROM properties
        WHERE geocoding_status = 'MANUAL' AND lat IS NOT NULL AND lng IS NOT NULL
          AND deleted_at IS NULL
          ${tenantParam ? `AND tenant_id = ${tenantParam}` : ''}
          ${cursorParam ? `AND id > ${cursorParam}` : ''}
        ORDER BY id ASC
        LIMIT ${limitParam}
      ), transitions AS (
        SELECT DISTINCT ON (a.entity_id)
               a.entity_id, a.id AS audit_log_id, a.created_at, a.redaction_status,
               a.before_json, a.after_json
        FROM audit_logs a
        JOIN manual_props m ON a.entity_id = m.id
        WHERE a.entity_type = 'Property'
          AND a.action = 'property.updated'
          AND a.after_json->>'geocodingStatus' = 'MANUAL'
          AND COALESCE(a.before_json->>'geocodingStatus', '') <> 'MANUAL'
        ORDER BY a.entity_id, a.created_at DESC
      )
      SELECT mp.id, mp.tenant_id, mp.property_code, mp.lat, mp.lng, mp.updated_at,
             mp.street, mp.address_line_2, mp.suburb, mp.state, mp.postcode, mp.country,
             t.audit_log_id, t.created_at AS transitioned_at, t.redaction_status,
             t.before_json, t.after_json
      FROM manual_props mp
      LEFT JOIN transitions t ON t.entity_id = mp.id
      ORDER BY mp.id ASC
    `;
    const rows: Array<{
      id: string; tenant_id: string; property_code: string; lat: unknown; lng: unknown;
      updated_at: Date; street: string; address_line_2: string | null; suburb: string;
      state: string; postcode: string; country: string;
      audit_log_id: string | null; transitioned_at: Date | null; redaction_status: string | null;
      before_json: Record<string, unknown> | null; after_json: Record<string, unknown> | null;
    }> = await this.prisma.$queryRawUnsafe(sql, ...params);
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      propertyCode: r.property_code,
      lat: Number(r.lat),
      lng: Number(r.lng),
      street: r.street,
      addressLine2: r.address_line_2,
      suburb: r.suburb,
      state: r.state,
      postcode: r.postcode,
      country: r.country,
      updatedAt: r.updated_at,
      auditLogId: r.audit_log_id,
      transitionedAt: r.transitioned_at,
      redactionStatus: r.redaction_status,
      beforeJson: r.before_json,
      afterJson: r.after_json,
    }));
  }

  async findAddressChangesAfter(
    transitionedAtById: Record<string, Date>,
    tenantId?: string | null,
  ): Promise<Record<string, boolean>> {
    const ids = Object.keys(transitionedAtById);
    const result: Record<string, boolean> = {};
    for (const id of ids) result[id] = false;
    if (ids.length === 0) return result;

    const rows = await this.prisma.auditLog.findMany({
      where: {
        entity_type: 'Property',
        action: 'property.updated',
        entity_id: { in: ids },
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      select: { entity_id: true, created_at: true, before_json: true, after_json: true },
    });

    const norm = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');
    const addressDiffers = (
      before: Record<string, unknown> | null,
      after: Record<string, unknown> | null,
    ): boolean => {
      if (!before || !after) return false;
      return (
        norm(before['street']) !== norm(after['street']) ||
        norm(before['suburb']) !== norm(after['suburb']) ||
        norm(before['state']) !== norm(after['state']) ||
        norm(before['country']) !== norm(after['country'])
      );
    };

    for (const row of rows) {
      const entityId = row.entity_id;
      if (!entityId) continue;
      const cutoff = transitionedAtById[entityId];
      if (!cutoff || row.created_at <= cutoff) continue;
      if (
        addressDiffers(
          row.before_json as Record<string, unknown> | null,
          row.after_json as Record<string, unknown> | null,
        )
      ) {
        result[entityId] = true;
      }
    }
    return result;
  }

  async findImportPreviewsToStrip(
    cursor: string | null,
    limit: number,
    tenantId?: string | null,
  ): Promise<ImportPreviewRow[]> {
    const conditions = [
      "status <> 'PREVIEW'",
      "status <> 'PROCESSING'",
      'preview_json IS NOT NULL',
    ];
    const params: unknown[] = [];
    let i = 1;
    if (tenantId) {
      conditions.push(`tenant_id = $${i++}`);
      params.push(tenantId);
    }
    if (cursor) {
      conditions.push(`id > $${i++}`);
      params.push(cursor);
    }
    params.push(limit);
    const sql = `
      SELECT id, tenant_id, preview_json
      FROM appointment_imports
      WHERE ${conditions.join(' AND ')}
      ORDER BY id ASC
      LIMIT $${i}
    `;
    const rows: Array<{ id: string; tenant_id: string; preview_json: unknown }> =
      await this.prisma.$queryRawUnsafe(sql, ...params);
    return rows.map((r) => ({ id: r.id, tenantId: r.tenant_id, previewJson: r.preview_json }));
  }

  async findAccountBlockedProperties(
    cursor: string | null,
    limit: number,
    tenantId?: string | null,
  ): Promise<Array<{ id: string; tenantId: string }>> {
    const rows = await this.prisma.property.findMany({
      where: {
        deleted_at: null,
        geocoding_status: 'FAILED' as PrismaGeocodingStatus,
        geocoding_failure_code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE',
        ...(tenantId ? { tenant_id: tenantId } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, tenant_id: true },
      orderBy: { id: 'asc' },
      take: limit,
    });
    return rows.map((r) => ({ id: r.id, tenantId: r.tenant_id }));
  }

  async applyPermanentBackfill(
    id: string,
    tenantId: string,
    expected: { lat: number; lng: number; updatedAt: Date },
    next: { lat: number; lng: number },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.property.updateMany({
        where: {
          id,
          tenant_id: tenantId,
          lat: expected.lat,
          lng: expected.lng,
          updated_at: expected.updatedAt,
          geocoding_status: { not: 'MANUAL' as PrismaGeocodingStatus },
          geocoded_permanently_at: null,
        },
        data: {
          lat: next.lat,
          lng: next.lng,
          geocoding_status: 'SUCCESS' as PrismaGeocodingStatus,
          geocoded_permanently_at: new Date(),
          geocoding_failure_code: null,
        },
      });
      if (res.count === 0) return false;
      await tx.$executeRaw`
        UPDATE properties
        SET coordinates = ST_SetSRID(ST_MakePoint(${next.lng}::float, ${next.lat}::float), 4326)
        WHERE id = ${id}
      `;
      return true;
    });
  }

  async markLegacyNoResult(
    id: string,
    tenantId: string,
    expected: { lat: number; lng: number; updatedAt: Date },
  ): Promise<boolean> {
    const res = await this.prisma.property.updateMany({
      where: {
        id,
        tenant_id: tenantId,
        lat: expected.lat,
        lng: expected.lng,
        updated_at: expected.updatedAt,
        geocoding_status: { not: 'MANUAL' as PrismaGeocodingStatus },
        geocoded_permanently_at: null,
      },
      data: {
        geocoding_status: 'FAILED' as PrismaGeocodingStatus,
        geocoding_failure_code: 'LEGACY_PERMANENT_NO_RESULT',
      },
    });
    return res.count > 0;
  }

  async restoreFalseManual(
    id: string,
    tenantId: string,
    expected: { lat: number; lng: number; updatedAt: Date },
    next: { lat: number; lng: number },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.property.updateMany({
        where: {
          id,
          tenant_id: tenantId,
          geocoding_status: 'MANUAL' as PrismaGeocodingStatus,
          lat: expected.lat,
          lng: expected.lng,
          updated_at: expected.updatedAt,
        },
        data: {
          lat: next.lat,
          lng: next.lng,
          geocoding_status: 'SUCCESS' as PrismaGeocodingStatus,
          geocoded_permanently_at: new Date(),
          geocoding_failure_code: null,
        },
      });
      if (res.count === 0) return false;
      await tx.$executeRaw`
        UPDATE properties
        SET coordinates = ST_SetSRID(ST_MakePoint(${next.lng}::float, ${next.lat}::float), 4326)
        WHERE id = ${id}
      `;
      return true;
    });
  }

  async backfillBranchCoordinates(
    id: string,
    tenantId: string,
    expected: { updatedAt: Date },
    next: { latitude: number; longitude: number },
  ): Promise<boolean> {
    const affected = await this.prisma.$executeRaw`
      UPDATE branches
      SET address_json = address_json || jsonb_build_object('latitude', ${next.latitude}::float, 'longitude', ${next.longitude}::float),
          geocoded_permanently_at = now(),
          updated_at = now()
      WHERE id = ${id}
        AND tenant_id = ${tenantId}
        AND geocoded_permanently_at IS NULL
        AND updated_at = ${expected.updatedAt}
    `;
    return affected > 0;
  }

  async replaceImportPreview(id: string, tenantId: string, previewJson: unknown): Promise<void> {
    // Tenant-scoped like every other write in this port (updateMany so a wrong
    // tenant simply matches nothing rather than throwing).
    await this.prisma.appointmentImport.updateMany({
      where: { id, tenant_id: tenantId },
      data: { preview_json: previewJson as Prisma.InputJsonValue },
    });
  }

  async requeueAccountBlocked(id: string, tenantId: string): Promise<void> {
    await this.update(id, tenantId, { geocodingStatus: 'PENDING', geocodingFailureCode: null });
  }
}
