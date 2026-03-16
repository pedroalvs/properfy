import { BaseEntity } from '../../../shared/domain/entity';
import type { TenantPortalTokenStatus } from '@properfy/shared';

export interface TenantPortalTokenProps {
  id: string;
  appointmentId: string;
  tokenHash: string;
  expiresAt: Date;
  status: TenantPortalTokenStatus;
  lastAccessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TenantPortalTokenEntity extends BaseEntity {
  readonly appointmentId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  status: TenantPortalTokenStatus;
  lastAccessedAt: Date | null;

  constructor(props: TenantPortalTokenProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.appointmentId = props.appointmentId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.status = props.status;
    this.lastAccessedAt = props.lastAccessedAt;
  }

  isExpired(now: Date): boolean {
    return now > this.expiresAt;
  }

  isRevoked(): boolean {
    return this.status === 'REVOKED';
  }

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  isReadOnly(now: Date): boolean {
    return this.status === 'EXPIRED' || (this.status === 'ACTIVE' && this.isExpired(now));
  }

  markExpired(): void {
    this.status = 'EXPIRED';
    this.updatedAt = new Date();
  }
}
