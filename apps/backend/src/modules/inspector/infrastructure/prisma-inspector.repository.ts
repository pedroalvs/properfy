import type { PrismaClient } from '@prisma/client';
import { InspectorStatus as PrismaInspectorStatus, Prisma } from '@prisma/client';
import { InspectorEntity } from '../domain/inspector.entity';
import type {
  IInspectorRepository,
  InspectorFilters,
  PaginationParams,
} from '../domain/inspector.repository';
import type { InspectorStatus } from '@properfy/shared';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function mapToEntity(row: {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  payment_settings_json: unknown;
  regions_json: unknown;
  service_types_json: unknown;
  client_eligibility_json: unknown;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}): InspectorEntity {
  return new InspectorEntity({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status as InspectorStatus,
    paymentSettingsJson:
      (row.payment_settings_json as Record<string, unknown>) ?? {},
    regionsJson: (row.regions_json as string[]) ?? [],
    serviceTypesJson: (row.service_types_json as string[]) ?? [],
    clientEligibilityJson: (row.client_eligibility_json as string[]) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PrismaInspectorRepository implements IInspectorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<InspectorEntity | null> {
    const row = await this.prisma.inspector.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByEmail(email: string): Promise<InspectorEntity | null> {
    const row = await this.prisma.inspector.findFirst({
      where: { email, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByUserId(userId: string): Promise<InspectorEntity | null> {
    const row = await this.prisma.inspector.findFirst({
      where: { user_id: userId, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async linkUserId(inspectorId: string, userId: string): Promise<void> {
    await this.prisma.inspector.update({
      where: { id: inspectorId },
      data: { user_id: userId },
    });
  }

  async findAll(
    filters: InspectorFilters,
    pagination: PaginationParams,
  ): Promise<InspectorEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.inspector.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [toSnakeCase(pagination.sortBy ?? 'created_at')]: pagination.sortOrder,
      },
    });

    // Post-filter by tenantId eligibility if needed
    if (filters.tenantId) {
      return rows
        .map(mapToEntity)
        .filter((i) => i.isEligibleForTenant(filters.tenantId!));
    }

    return rows.map(mapToEntity);
  }

  async count(filters: InspectorFilters): Promise<number> {
    if (filters.tenantId) {
      // For tenant filtering, we need to post-filter, so count all matching first
      const where = this.buildWhere(filters);
      const rows = await this.prisma.inspector.findMany({
        where,
        select: { client_eligibility_json: true },
      });
      return rows.filter((r) => {
        const eligibility = (r.client_eligibility_json as string[]) ?? [];
        return eligibility.includes(filters.tenantId!);
      }).length;
    }
    const where = this.buildWhere(filters);
    return this.prisma.inspector.count({ where });
  }

  async save(inspector: InspectorEntity): Promise<void> {
    await this.prisma.inspector.create({
      data: {
        id: inspector.id,
        name: inspector.name,
        email: inspector.email,
        phone: inspector.phone,
        status: inspector.status as PrismaInspectorStatus,
        payment_settings_json: inspector.paymentSettingsJson as Prisma.InputJsonValue,
        regions_json: inspector.regionsJson,
        service_types_json: inspector.serviceTypesJson,
        client_eligibility_json: inspector.clientEligibilityJson,
      },
    });
  }

  // Inspectors are global entities (not tenant-scoped); scoped by unique id only
  async update(
    id: string,
    data: Partial<{
      name: string;
      email: string;
      phone: string | null;
      status: string;
      paymentSettingsJson: Record<string, unknown>;
      regionsJson: string[];
      serviceTypesJson: string[];
      clientEligibilityJson: string[];
      deletedAt: Date | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.email !== undefined) updateData['email'] = data.email;
    if (data.phone !== undefined) updateData['phone'] = data.phone;
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.paymentSettingsJson !== undefined)
      updateData['payment_settings_json'] = data.paymentSettingsJson;
    if (data.regionsJson !== undefined)
      updateData['regions_json'] = data.regionsJson;
    if (data.serviceTypesJson !== undefined)
      updateData['service_types_json'] = data.serviceTypesJson;
    if (data.clientEligibilityJson !== undefined)
      updateData['client_eligibility_json'] = data.clientEligibilityJson;
    if (data.deletedAt !== undefined)
      updateData['deleted_at'] = data.deletedAt;
    await this.prisma.inspector.update({ where: { id }, data: updateData });
  }

  private buildWhere(filters: InspectorFilters) {
    const where: Record<string, unknown> = { deleted_at: null };
    if (filters.status) where['status'] = filters.status;
    if (filters.search) {
      where['OR'] = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.region) {
      where['regions_json'] = { array_contains: [filters.region] };
    }
    if (filters.serviceTypeId) {
      where['service_types_json'] = { array_contains: [filters.serviceTypeId] };
    }
    return where;
  }
}
