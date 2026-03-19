import type { PrismaClient } from '@prisma/client';
import { PropertyType as PrismaPropertyType, GeocodingStatus as PrismaGeocodingStatus, Prisma } from '@prisma/client';
import { PropertyEntity } from '../domain/property.entity';
import type {
  IPropertyRepository,
  PropertyFilters,
  PaginationParams,
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
    tenantId: string,
  ): Promise<PropertyEntity | null> {
    const where: Record<string, unknown> = { id, deleted_at: null };
    if (tenantId) where['tenant_id'] = tenantId;
    const row = await this.prisma.property.findFirst({ where });
    return row ? mapToEntity(row) : null;
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

  async findAll(
    filters: PropertyFilters,
    pagination: PaginationParams,
  ): Promise<PropertyEntity[]> {
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

  async count(filters: PropertyFilters): Promise<number> {
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
        lat: property.lat,
        lng: property.lng,
        geocoding_status: property.geocodingStatus as PrismaGeocodingStatus,
        notes: property.notes,
        rules_json: property.rulesJson as Prisma.InputJsonValue,
      },
    });
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
    await this.prisma.property.updateMany({
      where: { id, tenant_id: tenantId },
      data: updateData,
    });
  }

  private buildWhere(filters: PropertyFilters) {
    const where: Record<string, unknown> = { deleted_at: null };
    if (filters.tenantId) where['tenant_id'] = filters.tenantId;
    if (filters.branchId) where['branch_id'] = filters.branchId;
    if (filters.type) where['type'] = filters.type;
    if (filters.search) {
      where['OR'] = [
        {
          property_code: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
        { street: { contains: filters.search, mode: 'insensitive' } },
        { suburb: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
