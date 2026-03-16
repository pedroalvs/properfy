import { BaseEntity } from '../../../shared/domain/entity';

export interface SessionProps {
  id: string;
  userId: string;
  refreshTokenHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export class SessionEntity extends BaseEntity {
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly expiresAt: Date;
  revokedAt: Date | null;

  constructor(props: SessionProps) {
    super(props.id, props.createdAt, props.createdAt); // sessions have no updatedAt
    this.userId = props.userId;
    this.refreshTokenHash = props.refreshTokenHash;
    this.ipAddress = props.ipAddress;
    this.userAgent = props.userAgent;
    this.expiresAt = props.expiresAt;
    this.revokedAt = props.revokedAt;
  }

  isValid(): boolean {
    return this.revokedAt === null && this.expiresAt > new Date();
  }

  isRevoked(): boolean {
    return this.revokedAt !== null;
  }

  isExpired(): boolean {
    return this.expiresAt <= new Date();
  }
}
