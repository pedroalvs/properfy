import type { PrismaClient } from '@prisma/client';
import { TenantEntity } from '../domain/tenant.entity';
import type {
  ITenantRepository,
  TenantFilters,
  PaginationParams,
} from '../domain/tenant.repository';
import type { TenantStatus } from '@properfy/shared';

function mapToEntity(row: {
  id: string;
  name: string;
  legal_name: string;
  status: string;
  timezone: string;
  currency: string;
  settings_json: unknown;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}): TenantEntity {
  return new TenantEntity({
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    status: row.status as TenantStatus,
    timezone: row.timezone,
    currency: row.currency,
    settingsJson: (row.settings_json as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PrismaTenantRepository implements ITenantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<TenantEntity | null> {
    const row = await this.prisma.tenant.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByLegalName(legalName: string): Promise<TenantEntity | null> {
    const row = await this.prisma.tenant.findFirst({
      where: { legal_name: legalName, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findAll(
    filters: TenantFilters,
    pagination: PaginationParams,
  ): Promise<TenantEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.tenant.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [pagination.sortBy ?? 'created_at']: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
  }

  async count(filters: TenantFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.tenant.count({ where });
  }

  async save(tenant: TenantEntity): Promise<void> {
    await this.prisma.tenant.create({
      data: {
        id: tenant.id,
        name: tenant.name,
        legal_name: tenant.legalName,
        status: tenant.status as string,
        timezone: tenant.timezone,
        currency: tenant.currency,
        settings_json: tenant.settingsJson,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      legalName: string;
      timezone: string;
      currency: string;
      settingsJson: Record<string, unknown>;
      status: string;
      deletedAt: Date | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.legalName !== undefined) updateData['legal_name'] = data.legalName;
    if (data.timezone !== undefined) updateData['timezone'] = data.timezone;
    if (data.currency !== undefined) updateData['currency'] = data.currency;
    if (data.settingsJson !== undefined)
      updateData['settings_json'] = data.settingsJson;
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.deletedAt !== undefined) updateData['deleted_at'] = data.deletedAt;
    await this.prisma.tenant.update({ where: { id }, data: updateData });
  }

  private buildWhere(filters: TenantFilters) {
    const where: Record<string, unknown> = { deleted_at: null };
    if (filters.status) where['status'] = filters.status;
    if (filters.search) {
      where['OR'] = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { legal_name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
