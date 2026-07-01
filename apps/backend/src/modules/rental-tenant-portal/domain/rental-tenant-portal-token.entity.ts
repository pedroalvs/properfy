import { BaseEntity } from '../../../shared/domain/entity';
import type { RentalTenantPortalTokenStatus } from '@properfy/shared';

export interface RentalTenantPortalTokenProps {
  id: string;
  appointmentId: string;
  tokenHash: string;
  expiresAt: Date;
  status: RentalTenantPortalTokenStatus;
  usedAt: Date | null;
  lastAccessedAt: Date | null;
  rawTokenEncrypted?: string | null;
  confirmationCycleId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class RentalTenantPortalTokenEntity extends BaseEntity {
  readonly appointmentId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  status: RentalTenantPortalTokenStatus;
  usedAt: Date | null;
  lastAccessedAt: Date | null;
  readonly rawTokenEncrypted: string | null;
  readonly confirmationCycleId: string | null;

  constructor(props: RentalTenantPortalTokenProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.appointmentId = props.appointmentId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.status = props.status;
    this.usedAt = props.usedAt;
    this.lastAccessedAt = props.lastAccessedAt;
    this.rawTokenEncrypted = props.rawTokenEncrypted ?? null;
    this.confirmationCycleId = props.confirmationCycleId ?? null;
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

  isUsed(): boolean {
    return this.usedAt !== null;
  }

  isSuperseded(): boolean {
    return this.status === 'SUPERSEDED';
  }

  markUsed(): void {
    this.usedAt = new Date();
    this.updatedAt = new Date();
  }

  markExpired(): void {
    this.status = 'EXPIRED';
    this.updatedAt = new Date();
  }
}
