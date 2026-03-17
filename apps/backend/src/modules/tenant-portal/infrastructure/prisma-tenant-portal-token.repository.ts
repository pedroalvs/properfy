import type { PrismaClient } from '@prisma/client';
import { TenantPortalTokenStatus as PrismaTenantPortalTokenStatus } from '@prisma/client';
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
    lastAccessedAt: row.last_accessed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaTenantPortalTokenRepository implements ITenantPortalTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTokenHash(tokenHash: string): Promise<TenantPortalTokenEntity | null> {
    const row = await this.prisma.tenantPortalToken.findUnique({ where: { token_hash: tokenHash } });
    return row ? mapToEntity(row) : null;
  }

  async findActiveByAppointmentId(appointmentId: string): Promise<TenantPortalTokenEntity | null> {
    const row = await this.prisma.tenantPortalToken.findFirst({
      where: { appointment_id: appointmentId, status: 'ACTIVE' },
    });
    return row ? mapToEntity(row) : null;
  }

  async save(token: TenantPortalTokenEntity): Promise<void> {
    await this.prisma.tenantPortalToken.create({
      data: {
        id: token.id,
        appointment_id: token.appointmentId,
        token_hash: token.tokenHash,
        expires_at: token.expiresAt,
        status: token.status as PrismaTenantPortalTokenStatus,
        last_accessed_at: token.lastAccessedAt,
      },
    });
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await this.prisma.tenantPortalToken.update({ where: { id }, data: { status: status as PrismaTenantPortalTokenStatus } });
  }

  async updateLastAccessedAt(id: string, date: Date): Promise<void> {
    await this.prisma.tenantPortalToken.update({ where: { id }, data: { last_accessed_at: date } });
  }

  async revokeAllForAppointment(appointmentId: string): Promise<void> {
    await this.prisma.tenantPortalToken.updateMany({
      where: { appointment_id: appointmentId, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
  }
}
