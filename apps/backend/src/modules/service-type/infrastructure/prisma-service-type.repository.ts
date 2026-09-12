import type { PrismaClient, Prisma } from '@prisma/client';
import type { ServiceTypeFlowType as PrismaServiceTypeFlowType, ServiceTypeStatus as PrismaServiceTypeStatus } from '@prisma/client';
import { ServiceTypeEntity } from '../domain/service-type.entity';
import type {
  IServiceTypeRepository,
  ServiceTypeFilters,
  PaginationParams,
} from '../domain/service-type.repository';
import type { ServiceTypeFlowType, ServiceTypeStatus } from '@properfy/shared';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function mapToEntity(row: {
  id: string;
  code: string;
  name: string;
  flow_type: string;
  requires_rental_tenant_confirmation: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}): ServiceTypeEntity {
  return new ServiceTypeEntity({
    id: row.id,
    code: row.code,
    name: row.name,
    flowType: row.flow_type as ServiceTypeFlowType,
    requiresRentalTenantConfirmation: row.requires_rental_tenant_confirmation,
    status: row.status as ServiceTypeStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaServiceTypeRepository implements IServiceTypeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string, tx?: Prisma.TransactionClient): Promise<ServiceTypeEntity | null> {
    // Reading on the global client while the caller pins a transaction connection
    // borrows a second one from a pool that caps around 15 under PgBouncer.
    const row = await (tx ?? this.prisma).serviceType.findFirst({ where: { id, status: 'ACTIVE' } });
    return row ? mapToEntity(row) : null;
  }

  async findByCode(code: string): Promise<ServiceTypeEntity | null> {
    const row = await this.prisma.serviceType.findFirst({
      where: { code, status: 'ACTIVE' },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByCodeAnyStatus(code: string): Promise<ServiceTypeEntity | null> {
    // No status filter: an INACTIVE type still reserves its code, so the create
    // uniqueness check must see it too (#393). Match findByCode's exact (case-
    // sensitive) code semantics deliberately — only the status filter is dropped.
    const row = await this.prisma.serviceType.findFirst({
      where: { code },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByName(name: string): Promise<ServiceTypeEntity | null> {
    const row = await this.prisma.serviceType.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    return row ? mapToEntity(row) : null;
  }

  async findAll(
    filters: ServiceTypeFilters,
    pagination: PaginationParams,
  ): Promise<ServiceTypeEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.serviceType.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [toSnakeCase(pagination.sortBy ?? 'created_at')]: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
  }

  async count(filters: ServiceTypeFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.serviceType.count({ where });
  }

  async save(serviceType: ServiceTypeEntity): Promise<void> {
    await this.prisma.serviceType.create({
      data: {
        id: serviceType.id,
        code: serviceType.code,
        name: serviceType.name,
        flow_type: serviceType.flowType as PrismaServiceTypeFlowType,
        requires_rental_tenant_confirmation: serviceType.requiresRentalTenantConfirmation,
        status: serviceType.status as PrismaServiceTypeStatus,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      flowType: string;
      requiresRentalTenantConfirmation: boolean;
      status: string;
    }>,
  ): Promise<ServiceTypeEntity> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.flowType !== undefined)
      updateData['flow_type'] = data.flowType;
    if (data.requiresRentalTenantConfirmation !== undefined)
      updateData['requires_rental_tenant_confirmation'] =
        data.requiresRentalTenantConfirmation;
    if (data.status !== undefined) updateData['status'] = data.status;
    const row = await this.prisma.serviceType.update({ where: { id }, data: updateData });
    return mapToEntity(row);
  }

  private buildWhere(filters: ServiceTypeFilters) {
    const where: Record<string, unknown> = {};
    if (filters.status) where['status'] = filters.status;
    if (filters.search) {
      where['OR'] = [
        { code: { contains: filters.search, mode: 'insensitive' } },
        { name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
