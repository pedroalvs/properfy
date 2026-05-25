import type { TenantPortalTokenEntity } from './tenant-portal-token.entity';

export interface ITenantPortalTokenRepository {
  findByTokenHash(tokenHash: string): Promise<TenantPortalTokenEntity | null>;
  findActiveByAppointmentId(appointmentId: string): Promise<TenantPortalTokenEntity | null>;
  save(token: TenantPortalTokenEntity): Promise<void>;
  /** Atomically revoke all active tokens for the appointment and persist the new token. */
  revokeAndSave(appointmentId: string, newToken: TenantPortalTokenEntity): Promise<void>;
  updateStatus(id: string, appointmentId: string, status: string): Promise<void>;
  updateLastAccessedAt(id: string, appointmentId: string, date: Date): Promise<void>;
  markUsed(id: string): Promise<void>;
  revokeAllForAppointment(appointmentId: string): Promise<void>;
  expireActiveTokens(): Promise<number>;
}
