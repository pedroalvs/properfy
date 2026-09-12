import type { Prisma } from '@prisma/client';
import type { UserStatus } from '@properfy/shared';
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
  /** Active, non-deleted users holding any of the given roles (platform alert fan-out). */
  findActiveByRoles(roles: string[]): Promise<UserEntity[]>;
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
  /**
   * Applies `data` to the (non-deleted) user in the given tenant scope. Returns
   * true iff a row was actually updated; false means no matching live user
   * exists (wrong id, wrong tenant, or soft-deleted), which callers surface as
   * UserNotFoundError instead of assuming success (#240).
   */
  update(
    userId: string,
    tenantId: string | null,
    data: Partial<{
      name: string;
      phone: string | null;
      branchId: string | null;
      role: string;
      status: UserStatus;
      /** Personal timezone (cross-tenant roles only; CL_* targets are rejected upstream). */
      timezone: string | null;
      /** Kept in sync when an inspector's email — their login identity — changes. */
      email: string;
      deletedAt: Date | null;
    }>,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean>;
  resetPassword(
    userId: string,
    tenantId: string | null,
    passwordHash: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  unlock(userId: string, tenantId: string): Promise<void>;
  revokeAllSessions(userId: string, tx?: Prisma.TransactionClient): Promise<void>;
}
