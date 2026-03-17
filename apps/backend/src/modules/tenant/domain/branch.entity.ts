import { BaseEntity } from '../../../shared/domain/entity';
import type { BranchStatus } from '@properfy/shared';

export interface BranchProps {
  id: string;
  tenantId: string;
  name: string;
  addressJson: Record<string, unknown> | null;
  contactEmail: string | null;
  status: BranchStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class BranchEntity extends BaseEntity {
  readonly tenantId: string;
  readonly name: string;
  readonly addressJson: Record<string, unknown> | null;
  readonly contactEmail: string | null;
  status: BranchStatus;
  readonly deletedAt: Date | null;

  constructor(props: BranchProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.addressJson = props.addressJson;
    this.contactEmail = props.contactEmail;
    this.status = props.status;
    this.deletedAt = props.deletedAt;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE' && this.deletedAt === null;
  }

  isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
