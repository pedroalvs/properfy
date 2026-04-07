import { BaseEntity } from '../../../shared/domain/entity';
import type { TenantStatus } from '@properfy/shared';

export interface TenantProps {
  id: string;
  name: string;
  legalName: string;
  status: TenantStatus;
  timezone: string;
  currency: string;
  settingsJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class TenantEntity extends BaseEntity {
  readonly name: string;
  readonly legalName: string;
  status: TenantStatus;
  readonly timezone: string;
  readonly currency: string;
  readonly settingsJson: Record<string, unknown>;
  readonly deletedAt: Date | null;

  constructor(props: TenantProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.name = props.name;
    this.legalName = props.legalName;
    this.status = props.status;
    this.timezone = props.timezone;
    this.currency = props.currency;
    this.settingsJson = props.settingsJson;
    this.deletedAt = props.deletedAt;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE' && this.deletedAt === null;
  }

  isPending(): boolean {
    return this.status === 'PENDING' && this.deletedAt === null;
  }

  isInactive(): boolean {
    return this.status === 'INACTIVE';
  }

  isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  canBeDeactivated(): boolean {
    return this.status !== 'INACTIVE' && this.deletedAt === null;
  }

  canBeActivated(): boolean {
    return this.status !== 'ACTIVE' && this.deletedAt === null;
  }
}
