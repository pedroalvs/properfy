import type { PrismaClient } from '@prisma/client';
import type { UserRole as PrismaUserRole, UserStatus as PrismaUserStatus } from '@prisma/client';
import type { UserStatus } from '@properfy/shared';
import { UserEntity } from '../domain/user.entity';
import type { IUserRepository } from '../domain/user.repository';

function mapToEntity(row: {
  id: string;
  tenant_id: string | null;
  branch_id: string | null;
  role: string;
  name: string;
  email: string;
  phone: string | null;
  timezone: string | null;
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
    timezone: row.timezone,
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

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findFirst({
      where: { email, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async save(user: UserEntity): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        tenant_id: user.tenantId,
        branch_id: user.branchId,
        role: user.role as PrismaUserRole,
        name: user.name,
        email: user.email,
        phone: user.phone,
        timezone: user.timezone,
        status: user.status as PrismaUserStatus,
        password_hash: user.passwordHash,
        totp_secret: user.totpSecret,
        totp_enabled: user.totpEnabled,
        failed_login_count: user.failedLoginCount,
        locked_until: user.lockedUntil,
        last_login_at: user.lastLoginAt,
      },
      update: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        timezone: user.timezone,
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

  async updateLoginSuccess(userId: string, lastLoginAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        last_login_at: lastLoginAt,
        failed_login_count: 0,
      },
    });
  }

  async incrementFailedLogin(
    userId: string,
    lockThreshold: number,
    lockDurationMs: number,
  ): Promise<{ failedLoginCount: number; status: UserStatus; lockedUntil: Date | null }> {
    // Single-statement increment-and-maybe-lock. The lock decision is made
    // inside the UPDATE from the freshly-incremented value, so N concurrent
    // failed attempts produce a final count of exactly N and lock precisely at
    // the threshold — no read-modify-write window. `::int` guards the numeric
    // param binding gotcha; the enum literal is cast to the Postgres enum type.
    const lockedUntil = new Date(Date.now() + lockDurationMs);
    const rows = await this.prisma.$queryRaw<
      Array<{ failed_login_count: number; status: PrismaUserStatus; locked_until: Date | null }>
    >`
      UPDATE users
      SET failed_login_count = failed_login_count + 1,
          status = CASE
            WHEN failed_login_count + 1 >= ${lockThreshold}::int THEN 'LOCKED'::"UserStatus"
            ELSE status
          END,
          locked_until = CASE
            WHEN failed_login_count + 1 >= ${lockThreshold}::int THEN ${lockedUntil}::timestamptz
            ELSE locked_until
          END
      WHERE id = ${userId} AND deleted_at IS NULL
      RETURNING failed_login_count, status, locked_until
    `;
    const row = rows[0];
    if (!row) {
      // User vanished (soft-deleted) between read and write: nothing to lock.
      return { failedLoginCount: 0, status: 'ACTIVE', lockedUntil: null };
    }
    return {
      failedLoginCount: row.failed_login_count,
      status: row.status as UserStatus,
      lockedUntil: row.locked_until,
    };
  }

  async resetFailedLogin(userId: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, status: 'LOCKED' },
      data: {
        failed_login_count: 0,
        status: 'ACTIVE',
        locked_until: null,
      },
    });
  }

  async updateTimezone(userId: string, timezone: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { timezone },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { password_hash: passwordHash },
    });
  }

  async updateTotpSecret(userId: string, totpSecret: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totp_secret: totpSecret },
    });
  }

  async updateTotpEnabled(userId: string, totpEnabled: boolean): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totp_enabled: totpEnabled },
    });
  }

  async activateUser(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: passwordHash,
        status: 'ACTIVE',
      },
    });
  }
}
