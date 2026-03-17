import type { PrismaClient } from '@prisma/client';
import { BranchStatus as PrismaBranchStatus, Prisma } from '@prisma/client';
import { BranchEntity } from '../domain/branch.entity';
import type {
  IBranchRepository,
  BranchFilters,
  PaginationParams,
} from '../domain/branch.repository';
import type { BranchStatus } from '@properfy/shared';

function mapToEntity(row: {
  id: string;
  tenant_id: string;
  name: string;
  address_json: unknown;
  contact_email: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}): BranchEntity {
  return new BranchEntity({
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    addressJson: (row.address_json as Record<string, unknown>) ?? null,
    contactEmail: row.contact_email,
    status: row.status as BranchStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PrismaBranchRepository implements IBranchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string, tenantId: string): Promise<BranchEntity | null> {
    const where: Record<string, unknown> = { id, deleted_at: null };
    if (tenantId) where['tenant_id'] = tenantId;
    const row = await this.prisma.branch.findFirst({ where });
    return row ? mapToEntity(row) : null;
  }

  async findByName(
    tenantId: string,
    name: string,
  ): Promise<BranchEntity | null> {
    const row = await this.prisma.branch.findFirst({
      where: { tenant_id: tenantId, name, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findAll(
    tenantId: string,
    filters: BranchFilters,
    pagination: PaginationParams,
  ): Promise<BranchEntity[]> {
    const where = this.buildWhere(tenantId, filters);
    const rows = await this.prisma.branch.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [pagination.sortBy ?? 'created_at']: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
  }

  async count(tenantId: string, filters: BranchFilters): Promise<number> {
    const where = this.buildWhere(tenantId, filters);
    return this.prisma.branch.count({ where });
  }

  async save(branch: BranchEntity): Promise<void> {
    await this.prisma.branch.create({
      data: {
        id: branch.id,
        tenant_id: branch.tenantId,
        name: branch.name,
        address_json: (branch.addressJson as Prisma.InputJsonValue) ?? undefined,
        contact_email: branch.contactEmail,
        status: branch.status as PrismaBranchStatus,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      addressJson: Record<string, unknown> | null;
      contactEmail: string | null;
      status: string;
      deletedAt: Date | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.addressJson !== undefined)
      updateData['address_json'] = data.addressJson;
    if (data.contactEmail !== undefined)
      updateData['contact_email'] = data.contactEmail;
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.deletedAt !== undefined) updateData['deleted_at'] = data.deletedAt;
    await this.prisma.branch.update({ where: { id }, data: updateData });
  }

  private buildWhere(tenantId: string, filters: BranchFilters) {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      deleted_at: null,
    };
    if (filters.status) where['status'] = filters.status;
    if (filters.search) {
      where['name'] = { contains: filters.search, mode: 'insensitive' };
    }
    return where;
  }
}
