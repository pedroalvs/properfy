import { BaseEntity } from '../../../shared/domain/entity';
import type { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';

export interface FinancialEntryProps {
  id: string;
  tenantId: string;
  appointmentId: string | null;
  inspectorId: string | null;
  entryType: FinancialEntryType;
  amount: number;
  currency: string;
  status: FinancialEntryStatus;
  description: string;
  effectiveAt: Date;
  initiatedByUserId: string;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  referenceEntryId: string | null;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class FinancialEntryEntity extends BaseEntity {
  readonly tenantId: string;
  readonly appointmentId: string | null;
  readonly inspectorId: string | null;
  readonly entryType: FinancialEntryType;
  readonly amount: number;
  readonly currency: string;
  status: FinancialEntryStatus;
  readonly description: string;
  readonly effectiveAt: Date;
  readonly initiatedByUserId: string;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  readonly referenceEntryId: string | null;
  readonly reason: string | null;

  constructor(props: FinancialEntryProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.appointmentId = props.appointmentId;
    this.inspectorId = props.inspectorId;
    this.entryType = props.entryType;
    this.amount = props.amount;
    this.currency = props.currency;
    this.status = props.status;
    this.description = props.description;
    this.effectiveAt = props.effectiveAt;
    this.initiatedByUserId = props.initiatedByUserId;
    this.approvedByUserId = props.approvedByUserId;
    this.approvedAt = props.approvedAt;
    this.referenceEntryId = props.referenceEntryId;
    this.reason = props.reason;
  }

  isPending(): boolean {
    return this.status === 'PENDING';
  }

  isApproved(): boolean {
    return this.status === 'APPROVED';
  }

  canBeApproved(): boolean {
    return this.status === 'PENDING';
  }

  isSelfApproval(userId: string): boolean {
    return this.initiatedByUserId === userId;
  }
}
