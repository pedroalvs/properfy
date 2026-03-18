import type { TenantPortalTokenEntity } from './tenant-portal-token.entity';

export interface ITenantPortalTokenRepository {
  findByTokenHash(tokenHash: string): Promise<TenantPortalTokenEntity | null>;
  findActiveByAppointmentId(appointmentId: string): Promise<TenantPortalTokenEntity | null>;
  save(token: TenantPortalTokenEntity): Promise<void>;
  updateStatus(id: string, appointmentId: string, status: string): Promise<void>;
  updateLastAccessedAt(id: string, appointmentId: string, date: Date): Promise<void>;
  revokeAllForAppointment(appointmentId: string): Promise<void>;
  expireActiveTokens(): Promise<number>;
}
