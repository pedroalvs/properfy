import type { PrismaClient } from '@prisma/client';
import { UserRole as PrismaUserRole, UserStatus as PrismaUserStatus } from '@prisma/client';
import { UserEntity } from '../../auth/domain/user.entity';
import type {
  IUserManagementRepository,
  UserManagementFilters,
  PaginationParams,
} from '../domain/user-management.repository';

function mapToEntity(row: {
  id: string;
  tenant_id: string | null;
  branch_id: string | null;
  role: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  password_hash: string;
  totp_secret: string | null;
  totp_enabled: boolean;
  failed_login_count: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}): UserEntity {
  return new UserEntity({
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    role: row.role as UserEntity['role'],
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status as UserEntity['status'],
    passwordHash: row.password_hash,
    totpSecret: row.totp_secret,
    totpEnabled: row.totp_enabled,
    failedLoginCount: row.failed_login_count,
    lockedUntil: row.locked_until,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PrismaUserManagementRepository
  implements IUserManagementRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByIdAndTenantId(
    userId: string,
    tenantId: string,
  ): Promise<UserEntity | null> {
    const row = await this.prisma.user.findFirst({
      where: { id: userId, tenant_id: tenantId, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findFirst({
      where: { email, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByTenantId(
    tenantId: string,
    filters: UserManagementFilters,
    pagination: PaginationParams,
  ): Promise<UserEntity[]> {
    const where = this.buildWhere(tenantId, filters);
    const rows = await this.prisma.user.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [pagination.sortBy ?? 'created_at']: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
  }

  async countByTenantId(
    tenantId: string,
    filters: UserManagementFilters,
  ): Promise<number> {
    const where = this.buildWhere(tenantId, filters);
    return this.prisma.user.count({ where });
  }

  async save(user: UserEntity): Promise<void> {
    await this.prisma.user.create({
      data: {
        id: user.id,
        tenant_id: user.tenantId,
        branch_id: user.branchId,
        role: user.role as PrismaUserRole,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status as PrismaUserStatus,
        password_hash: user.passwordHash,
        totp_secret: user.totpSecret,
        totp_enabled: user.totpEnabled,
        failed_login_count: user.failedLoginCount,
        locked_until: user.lockedUntil,
        last_login_at: user.lastLoginAt,
      },
    });
  }

  async update(
    userId: string,
    tenantId: string,
    data: Partial<{
      name: string;
      phone: string | null;
      branchId: string | null;
      role: string;
      status: string;
      deletedAt: Date | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.phone !== undefined) updateData['phone'] = data.phone;
    if (data.branchId !== undefined) updateData['branch_id'] = data.branchId;
    if (data.role !== undefined) updateData['role'] = data.role;
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.deletedAt !== undefined) updateData['deleted_at'] = data.deletedAt;
    await this.prisma.user.updateMany({ where: { id: userId, tenant_id: tenantId }, data: updateData });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  private buildWhere(tenantId: string, filters: UserManagementFilters) {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      deleted_at: null,
    };
    if (filters.status) where['status'] = filters.status;
    if (filters.role) where['role'] = filters.role;
    if (filters.search) {
      where['OR'] = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
