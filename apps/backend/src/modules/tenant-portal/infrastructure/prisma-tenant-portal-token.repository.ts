import type { PrismaClient, Prisma } from '@prisma/client';
import type { TenantPortalTokenStatus as PrismaTenantPortalTokenStatus } from '@prisma/client';
import { TenantPortalTokenEntity } from '../domain/tenant-portal-token.entity';
import type { ITenantPortalTokenRepository } from '../domain/tenant-portal-token.repository';
import type { TenantPortalTokenStatus } from '@properfy/shared';

function mapToEntity(row: any): TenantPortalTokenEntity {
  return new TenantPortalTokenEntity({
    id: row.id,
    appointmentId: row.appointment_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    status: row.status as TenantPortalTokenStatus,
    usedAt: row.used_at,
    lastAccessedAt: row.last_accessed_at,
    rawTokenEncrypted: row.raw_token_encrypted ?? null,
    confirmationCycleId: row.confirmation_cycle_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

type DbClient = PrismaClient | Prisma.TransactionClient;

export class PrismaTenantPortalTokenRepository implements ITenantPortalTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTokenHash(tokenHash: string): Promise<TenantPortalTokenEntity | null> {
    const row = await this.prisma.tenantPortalToken.findUnique({ where: { token_hash: tokenHash } });
    return row ? mapToEntity(row) : null;
  }

  async findActiveByAppointmentId(appointmentId: string): Promise<TenantPortalTokenEntity | null> {
    // CQ-2: include expires_at > now() so ACTIVE-but-expired tokens are treated as inactive.
    // Node clock is the authority (AC-2.5) — matches the expire-tokens worker convention.
    const row = await this.prisma.tenantPortalToken.findFirst({
      where: { appointment_id: appointmentId, status: 'ACTIVE', expires_at: { gt: new Date() } },
    });
    return row ? mapToEntity(row) : null;
  }

  async save(token: TenantPortalTokenEntity, tx?: Prisma.TransactionClient): Promise<void> {
    const db: DbClient = tx ?? this.prisma;
    await db.tenantPortalToken.create({
      data: {
        id: token.id,
        appointment_id: token.appointmentId,
        token_hash: token.tokenHash,
        expires_at: token.expiresAt,
        status: token.status as PrismaTenantPortalTokenStatus,
        last_accessed_at: token.lastAccessedAt,
        raw_token_encrypted: token.rawTokenEncrypted,
        confirmation_cycle_id: token.confirmationCycleId,
      },
    });
  }

  async updateStatus(id: string, appointmentId: string, status: string): Promise<void> {
    await this.prisma.tenantPortalToken.updateMany({
      where: { id, appointment_id: appointmentId },
      data: { status: status as PrismaTenantPortalTokenStatus },
    });
  }

  async updateLastAccessedAt(id: string, appointmentId: string, date: Date): Promise<void> {
    await this.prisma.tenantPortalToken.updateMany({
      where: { id, appointment_id: appointmentId },
      data: { last_accessed_at: date },
    });
  }

  async markUsed(id: string): Promise<void> {
    await this.prisma.tenantPortalToken.update({
      where: { id },
      data: { used_at: new Date() },
    });
  }

  async revokeAndSave(
    appointmentId: string,
    newToken: TenantPortalTokenEntity,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const doWork = async (client: DbClient) => {
      await client.tenantPortalToken.updateMany({
        where: { appointment_id: appointmentId, status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      });
      await client.tenantPortalToken.create({
        data: {
          id: newToken.id,
          appointment_id: newToken.appointmentId,
          token_hash: newToken.tokenHash,
          expires_at: newToken.expiresAt,
          status: newToken.status as PrismaTenantPortalTokenStatus,
          last_accessed_at: newToken.lastAccessedAt,
          raw_token_encrypted: newToken.rawTokenEncrypted,
          confirmation_cycle_id: newToken.confirmationCycleId,
        },
      });
    };

    if (tx) {
      await doWork(tx);
    } else {
      await this.prisma.$transaction(doWork);
    }
  }

  async revokeAllForAppointment(appointmentId: string): Promise<void> {
    await this.prisma.tenantPortalToken.updateMany({
      where: { appointment_id: appointmentId, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
  }

  // Cross-tenant: background job processes all tenants to expire stale portal tokens
  async expireActiveTokens(): Promise<number> {
    const result = await this.prisma.tenantPortalToken.updateMany({
      where: {
        status: 'ACTIVE',
        expires_at: { lt: new Date() },
      },
      data: { status: 'EXPIRED' as PrismaTenantPortalTokenStatus },
    });
    return result.count;
  }
}
