import { BaseEntity } from '../../../shared/domain/entity';
import type { UserRole, UserStatus } from '@properfy/shared';

export interface UserProps {
  id: string;
  tenantId: string | null;
  branchId: string | null;
  role: UserRole;
  name: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  passwordHash: string;
  totpSecret: string | null;
  totpEnabled: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class UserEntity extends BaseEntity {
  readonly tenantId: string | null;
  readonly branchId: string | null;
  readonly role: UserRole;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  status: UserStatus;
  readonly passwordHash: string;
  readonly totpSecret: string | null;
  readonly totpEnabled: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  readonly deletedAt: Date | null;

  constructor(props: UserProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.branchId = props.branchId;
    this.role = props.role;
    this.name = props.name;
    this.email = props.email;
    this.phone = props.phone;
    this.status = props.status;
    this.passwordHash = props.passwordHash;
    this.totpSecret = props.totpSecret;
    this.totpEnabled = props.totpEnabled;
    this.failedLoginCount = props.failedLoginCount;
    this.lockedUntil = props.lockedUntil;
    this.lastLoginAt = props.lastLoginAt;
    this.deletedAt = props.deletedAt;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE' && this.deletedAt === null;
  }

  isLocked(): boolean {
    if (this.status !== 'LOCKED') return false;
    // Treat null lockedUntil as permanently locked (data inconsistency guard)
    return this.lockedUntil === null || this.lockedUntil > new Date();
  }

  isLockExpired(): boolean {
    return this.status === 'LOCKED' && this.lockedUntil !== null && this.lockedUntil <= new Date();
  }

  isInactive(): boolean {
    return this.status === 'INACTIVE';
  }

  isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  requiresTotpSetup(): boolean {
    return this.role === 'AM' && !this.totpEnabled;
  }

  requiresTotpCode(): boolean {
    return this.role === 'AM' && this.totpEnabled;
  }
}
