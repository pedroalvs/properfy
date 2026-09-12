import { BaseEntity } from '../../../shared/domain/entity';

export interface SessionProps {
  id: string;
  userId: string;
  refreshTokenHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  countryCode: string | null;
  deviceFingerprint: string | null;
  /**
   * `'totp_setup'` for the limited 15-minute AM enrollment session; null for
   * every normal session. Persisted so refresh-token rotation can refuse to
   * extend a setup session.
   */
  authStage: string | null;
  /** Last time this session was used (bumped on refresh-token rotation); null until first refresh. */
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export class SessionEntity extends BaseEntity {
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly countryCode: string | null;
  readonly deviceFingerprint: string | null;
  readonly authStage: string | null;
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date;
  revokedAt: Date | null;

  constructor(props: SessionProps) {
    super(props.id, props.createdAt, props.createdAt); // sessions have no updatedAt
    this.userId = props.userId;
    this.refreshTokenHash = props.refreshTokenHash;
    this.ipAddress = props.ipAddress;
    this.userAgent = props.userAgent;
    this.countryCode = props.countryCode;
    this.deviceFingerprint = props.deviceFingerprint;
    this.authStage = props.authStage;
    this.lastUsedAt = props.lastUsedAt;
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
