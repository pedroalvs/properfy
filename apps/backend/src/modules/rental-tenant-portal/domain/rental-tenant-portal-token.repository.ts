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
  /**
   * Newest token for the appointment whose life can still be extended.
   *
   * Narrowed to ACTIVE and EXPIRED: a REVOKED or SUPERSEDED token is rejected by
   * the portal middleware (410), so extending one would hand the tenant a link
   * that can never be opened.
   */
  findLatestExtendableByAppointmentId(appointmentId: string): Promise<RentalTenantPortalTokenEntity | null>;
  /**
   * Pushes `expires_at` out to at least `notBefore` and revives an EXPIRED token.
   *
   * Must be a single conditional statement, never read-modify-write: the
   * expire-tokens worker runs concurrently and would otherwise be overwritten
   * with a stale status. `confirm_cutoff_at` is deliberately untouched, so
   * reviving the token does not reopen confirmation.
   *
   * Returns whether a row actually matched.
   */
  extendExpiryAndReactivate(id: string, appointmentId: string, notBefore: Date): Promise<boolean>;
}
