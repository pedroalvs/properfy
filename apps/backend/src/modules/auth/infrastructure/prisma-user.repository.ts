import type { PrismaClient } from '@prisma/client';
import { UserRole as PrismaUserRole, UserStatus as PrismaUserStatus } from '@prisma/client';
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

  async updateFailedLogin(
    userId: string,
    failedLoginCount: number,
    lockedUntil: Date | null,
    status: string,
  ): Promise<void> {
    // Use atomic increment instead of setting a computed value to avoid race conditions
    // The failedLoginCount param is used to determine if we should lock (>= 5 means lock)
    if (status === 'LOCKED') {
      // Lock the account atomically
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failed_login_count: { increment: 1 },
          locked_until: lockedUntil,
          status: 'LOCKED',
        },
      });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failed_login_count: { increment: 1 },
          locked_until: null,
          status: 'ACTIVE',
        },
      });
    }
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
}
