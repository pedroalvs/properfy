import type { PrismaClient } from '@prisma/client';
import type { TenantStatus as PrismaTenantStatus, Prisma } from '@prisma/client';
import { TenantEntity } from '../domain/tenant.entity';
import type {
  ITenantRepository,
  TenantFilters,
  PaginationParams,
} from '../domain/tenant.repository';
import type { TenantStatus } from '@properfy/shared';
import { TenantAppointmentCodePrefixConflictError } from '../domain/tenant.errors';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Translates a Postgres unique-constraint violation on appointment_code_prefix
 * (Prisma P2002) into the domain conflict error, so concurrent writes that slip
 * past the application-level pre-check still surface a friendly 409.
 */
function rethrowPrefixConflict(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002' &&
    JSON.stringify((error as { meta?: { target?: unknown } }).meta?.target ?? '').includes(
      'appointment_code_prefix',
    )
  ) {
    throw new TenantAppointmentCodePrefixConflictError();
  }
  throw error;
}

function mapToEntity(row: {
  id: string;
  name: string;
  legal_name: string;
  status: string;
  timezone: string;
  currency: string;
  appointment_code_prefix: string | null;
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
    appointmentCodePrefix: row.appointment_code_prefix ?? null,
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

  async findByAppointmentCodePrefix(prefix: string): Promise<TenantEntity | null> {
    const row = await this.prisma.tenant.findFirst({
      where: { appointment_code_prefix: prefix, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findAll(
    filters: TenantFilters,
    pagination: PaginationParams,
  ): Promise<TenantEntity[]> {
    const VALID_SORT_FIELDS = new Set(['name', 'legal_name', 'status', 'created_at', 'updated_at']);
    const rawSort = toSnakeCase(pagination.sortBy ?? 'created_at');
    const sortField = VALID_SORT_FIELDS.has(rawSort) ? rawSort : 'created_at';
    const where = this.buildWhere(filters);
    const rows = await this.prisma.tenant.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { [sortField]: pagination.sortOrder },
    });
    return rows.map(mapToEntity);
  }

  async count(filters: TenantFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.tenant.count({ where });
  }

  async save(tenant: TenantEntity): Promise<void> {
    try {
      await this.prisma.tenant.create({
        data: {
          id: tenant.id,
          name: tenant.name,
          legal_name: tenant.legalName,
          status: tenant.status as PrismaTenantStatus,
          timezone: tenant.timezone,
          currency: tenant.currency,
          appointment_code_prefix: tenant.appointmentCodePrefix,
          settings_json: tenant.settingsJson as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      rethrowPrefixConflict(error);
    }
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      legalName: string;
      timezone: string;
      currency: string;
      appointmentCodePrefix: string | null;
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
    if (data.appointmentCodePrefix !== undefined)
      updateData['appointment_code_prefix'] = data.appointmentCodePrefix;
    if (data.settingsJson !== undefined)
      updateData['settings_json'] = data.settingsJson;
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.deletedAt !== undefined) updateData['deleted_at'] = data.deletedAt;
    try {
      await this.prisma.tenant.update({ where: { id }, data: updateData });
    } catch (error) {
      rethrowPrefixConflict(error);
    }
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
