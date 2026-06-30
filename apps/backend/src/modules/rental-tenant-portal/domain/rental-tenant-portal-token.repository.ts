import type { Prisma } from '@prisma/client';
import type { RentalTenantPortalTokenEntity } from './rental-tenant-portal-token.entity';

export interface IRentalTenantPortalTokenRepository {
  findByTokenHash(tokenHash: string): Promise<RentalTenantPortalTokenEntity | null>;
  findActiveByAppointmentId(appointmentId: string): Promise<RentalTenantPortalTokenEntity | null>;
  /**
   * Persist a new token. When `tx` is provided, uses the caller's transaction (no internal tx opened).
   * When `tx` is omitted, behaviour is a single insert (no revocation).
   */
  save(token: RentalTenantPortalTokenEntity, tx?: Prisma.TransactionClient): Promise<void>;
  /**
   * Atomically revoke all active tokens for the appointment and persist the new token.
   * When `tx` is provided, uses the caller's transaction. When omitted, opens own transaction.
   */
  revokeAndSave(appointmentId: string, newToken: RentalTenantPortalTokenEntity, tx?: Prisma.TransactionClient): Promise<void>;
  updateStatus(id: string, appointmentId: string, status: string): Promise<void>;
  updateLastAccessedAt(id: string, appointmentId: string, date: Date): Promise<void>;
  markUsed(id: string): Promise<void>;
  revokeAllForAppointment(appointmentId: string): Promise<void>;
  expireActiveTokens(): Promise<number>;
}
