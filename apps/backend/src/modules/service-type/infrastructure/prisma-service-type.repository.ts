import type { PrismaClient } from '@prisma/client';
import { ServiceTypeEntity } from '../domain/service-type.entity';
import type {
  IServiceTypeRepository,
  ServiceTypeFilters,
  PaginationParams,
} from '../domain/service-type.repository';
import type { ServiceTypeFlowType, ServiceTypeStatus } from '@properfy/shared';

function mapToEntity(row: {
  id: string;
  code: string;
  name: string;
  flow_type: string;
  requires_tenant_confirmation: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}): ServiceTypeEntity {
  return new ServiceTypeEntity({
    id: row.id,
    code: row.code,
    name: row.name,
    flowType: row.flow_type as ServiceTypeFlowType,
    requiresTenantConfirmation: row.requires_tenant_confirmation,
    status: row.status as ServiceTypeStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaServiceTypeRepository implements IServiceTypeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ServiceTypeEntity | null> {
    const row = await this.prisma.serviceType.findFirst({ where: { id } });
    return row ? mapToEntity(row) : null;
  }

  async findByCode(code: string): Promise<ServiceTypeEntity | null> {
    const row = await this.prisma.serviceType.findFirst({
      where: { code },
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
        [pagination.sortBy ?? 'created_at']: pagination.sortOrder,
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
        flow_type: serviceType.flowType as string,
        requires_tenant_confirmation: serviceType.requiresTenantConfirmation,
        status: serviceType.status as string,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      flowType: string;
      requiresTenantConfirmation: boolean;
      status: string;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.flowType !== undefined)
      updateData['flow_type'] = data.flowType;
    if (data.requiresTenantConfirmation !== undefined)
      updateData['requires_tenant_confirmation'] =
        data.requiresTenantConfirmation;
    if (data.status !== undefined) updateData['status'] = data.status;
    await this.prisma.serviceType.update({ where: { id }, data: updateData });
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
