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
  /**
   * Atomically consume the token (compare-and-set on `used_at IS NULL`).
   * Returns true when this call won the claim; false when the token was
   * already used — the caller must treat false as "already used" and stop.
   */
  tryClaim(id: string, appointmentId: string): Promise<boolean>;
  /**
   * Best-effort rollback of a successful `tryClaim` when the mutation that
   * followed it failed, so the tenant can retry with the same link.
   */
  releaseClaim(id: string, appointmentId: string): Promise<void>;
  revokeAllForAppointment(appointmentId: string): Promise<void>;
  expireActiveTokens(): Promise<number>;
}
