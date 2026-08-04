import type { UserEntity } from '../../auth/domain/user.entity';

export interface UserManagementFilters {
  status?: string;
  role?: string;
  search?: string;
  excludeRoles?: string[];
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
    tenantId: string | null,
  ): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  /** Feature 020 FR-019b: phone-input path for data subject erasure resolver. */
  findByPhone(phone: string): Promise<UserEntity | null>;
  findByTenantId(
    tenantId: string | null,
    filters: UserManagementFilters,
    pagination: PaginationParams,
  ): Promise<UserEntity[]>;
  countByTenantId(
    tenantId: string | null,
    filters: UserManagementFilters,
  ): Promise<number>;
  save(user: UserEntity): Promise<void>;
  update(
    userId: string,
    tenantId: string | null,
    data: Partial<{
      name: string;
      phone: string | null;
      branchId: string | null;
      role: string;
      status: string;
      /** Personal timezone (cross-tenant roles only; CL_* targets are rejected upstream). */
      timezone: string | null;
      /** Kept in sync when an inspector's email — their login identity — changes. */
      email: string;
      deletedAt: Date | null;
    }>,
  ): Promise<void>;
  resetPassword(
    userId: string,
    tenantId: string | null,
    passwordHash: string,
  ): Promise<void>;
  unlock(userId: string, tenantId: string): Promise<void>;
  revokeAllSessions(userId: string): Promise<void>;
}
