import type { UserEntity } from '../../auth/domain/user.entity';

export interface UserManagementFilters {
  status?: string;
  role?: string;
  search?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface IUserManagementRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByIdAndTenantId(
    userId: string,
    tenantId: string,
  ): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByTenantId(
    tenantId: string,
    filters: UserManagementFilters,
    pagination: PaginationParams,
  ): Promise<UserEntity[]>;
  countByTenantId(
    tenantId: string,
    filters: UserManagementFilters,
  ): Promise<number>;
  save(user: UserEntity): Promise<void>;
  update(
    userId: string,
    data: Partial<{
      name: string;
      phone: string | null;
      branchId: string | null;
      role: string;
      status: string;
      deletedAt: Date | null;
    }>,
  ): Promise<void>;
  revokeAllSessions(userId: string): Promise<void>;
}
