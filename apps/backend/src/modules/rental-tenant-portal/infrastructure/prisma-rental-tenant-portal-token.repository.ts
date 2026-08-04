import type { PrismaClient, Prisma } from '@prisma/client';
import type { RentalTenantPortalTokenStatus as PrismaRentalTenantPortalTokenStatus } from '@prisma/client';
import { RentalTenantPortalTokenEntity } from '../domain/rental-tenant-portal-token.entity';
import type { IRentalTenantPortalTokenRepository } from '../domain/rental-tenant-portal-token.repository';
import type { RentalTenantPortalTokenStatus } from '@properfy/shared';

function mapToEntity(row: any): RentalTenantPortalTokenEntity {
  return new RentalTenantPortalTokenEntity({
    id: row.id,
    appointmentId: row.appointment_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    confirmCutoffAt: row.confirm_cutoff_at ?? null,
    status: row.status as RentalTenantPortalTokenStatus,
    usedAt: row.used_at,
    lastAccessedAt: row.last_accessed_at,
    rawTokenEncrypted: row.raw_token_encrypted ?? null,
    confirmationCycleId: row.confirmation_cycle_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

type DbClient = PrismaClient | Prisma.TransactionClient;

export class PrismaRentalTenantPortalTokenRepository implements IRentalTenantPortalTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTokenHash(tokenHash: string): Promise<RentalTenantPortalTokenEntity | null> {
    const row = await this.prisma.rentalTenantPortalToken.findUnique({ where: { token_hash: tokenHash } });
    return row ? mapToEntity(row) : null;
  }

  async findActiveByAppointmentId(appointmentId: string): Promise<RentalTenantPortalTokenEntity | null> {
    // CQ-2: include expires_at > now() so ACTIVE-but-expired tokens are treated as inactive.
    // Node clock is the authority (AC-2.5) — matches the expire-tokens worker convention.
    const row = await this.prisma.rentalTenantPortalToken.findFirst({
      where: { appointment_id: appointmentId, status: 'ACTIVE', expires_at: { gt: new Date() } },
    });
    return row ? mapToEntity(row) : null;
  }

  async save(token: RentalTenantPortalTokenEntity, tx?: Prisma.TransactionClient): Promise<void> {
    const db: DbClient = tx ?? this.prisma;
    await db.rentalTenantPortalToken.create({
      data: {
        id: token.id,
        appointment_id: token.appointmentId,
        token_hash: token.tokenHash,
        expires_at: token.expiresAt,
        confirm_cutoff_at: token.confirmCutoffAt,
        status: token.status as PrismaRentalTenantPortalTokenStatus,
        last_accessed_at: token.lastAccessedAt,
        raw_token_encrypted: token.rawTokenEncrypted,
        confirmation_cycle_id: token.confirmationCycleId,
      },
    });
  }

  async updateStatus(id: string, appointmentId: string, status: string): Promise<void> {
    await this.prisma.rentalTenantPortalToken.updateMany({
      where: { id, appointment_id: appointmentId },
      data: { status: status as PrismaRentalTenantPortalTokenStatus },
    });
  }

  async updateLastAccessedAt(id: string, appointmentId: string, date: Date): Promise<void> {
    await this.prisma.rentalTenantPortalToken.updateMany({
      where: { id, appointment_id: appointmentId },
      data: { last_accessed_at: date },
    });
  }

  async tryClaim(id: string, appointmentId: string): Promise<boolean> {
    // Conditional write: only one of N concurrent claims matches used_at NULL.
    const result = await this.prisma.rentalTenantPortalToken.updateMany({
      where: { id, appointment_id: appointmentId, used_at: null },
      data: { used_at: new Date() },
    });
    return result.count === 1;
  }

  async releaseClaim(id: string, appointmentId: string): Promise<void> {
    await this.prisma.rentalTenantPortalToken.updateMany({
      where: { id, appointment_id: appointmentId },
      data: { used_at: null },
    });
  }

  async revokeAndSave(
    appointmentId: string,
    newToken: RentalTenantPortalTokenEntity,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const doWork = async (client: DbClient) => {
      await client.rentalTenantPortalToken.updateMany({
        where: { appointment_id: appointmentId, status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      });
      await client.rentalTenantPortalToken.create({
        data: {
          id: newToken.id,
          appointment_id: newToken.appointmentId,
          token_hash: newToken.tokenHash,
          expires_at: newToken.expiresAt,
          confirm_cutoff_at: newToken.confirmCutoffAt,
          status: newToken.status as PrismaRentalTenantPortalTokenStatus,
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
    await this.prisma.rentalTenantPortalToken.updateMany({
      where: { appointment_id: appointmentId, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
  }

  // Cross-tenant: background job processes all tenants to expire stale portal tokens
  async findLatestExtendableByAppointmentId(
    appointmentId: string,
  ): Promise<RentalTenantPortalTokenEntity | null> {
    const row = await this.prisma.rentalTenantPortalToken.findFirst({
      // REVOKED and SUPERSEDED are excluded on purpose: the portal middleware
      // rejects both with 410, so a revived one could never be opened.
      where: { appointment_id: appointmentId, status: { in: ['ACTIVE', 'EXPIRED'] } },
      orderBy: { created_at: 'desc' },
    });
    return row ? mapToEntity(row) : null;
  }

  async extendExpiryAndReactivate(
    id: string,
    appointmentId: string,
    notBefore: Date,
  ): Promise<boolean> {
    // One conditional UPDATE, never read-modify-write: `expire-tokens.worker`
    // runs on a schedule and could flip this row to EXPIRED between a read and a
    // write, which we would then overwrite with a stale status.
    //
    // GREATEST makes the statement idempotent under replay — a second DONE
    // transition can only ever push the deadline out, never pull it in.
    //
    // Prisma cannot express GREATEST or a conditional column update, hence raw
    // SQL. Parameters are interpolated by Prisma.sql, never string-concatenated.
    const updated = await this.prisma.$executeRaw`
      UPDATE rental_tenant_portal_tokens
         SET expires_at = GREATEST(expires_at, ${notBefore}),
             status = CASE
               WHEN status = 'EXPIRED' THEN 'ACTIVE'::"RentalTenantPortalTokenStatus"
               ELSE status
             END,
             updated_at = now()
       WHERE id = ${id}
         AND appointment_id = ${appointmentId}
         AND status IN ('ACTIVE', 'EXPIRED')
    `;
    return updated > 0;
  }

  async expireActiveTokens(): Promise<number> {
    const result = await this.prisma.rentalTenantPortalToken.updateMany({
      where: {
        status: 'ACTIVE',
        expires_at: { lt: new Date() },
      },
      data: { status: 'EXPIRED' as PrismaRentalTenantPortalTokenStatus },
    });
    return result.count;
  }
}
