import { BaseEntity } from '../../../shared/domain/entity';
import type { TenantInvoiceStatus } from '@properfy/shared';

export interface TenantInvoiceProps {
  id: string;
  tenantId: string;
  periodFrom: Date;
  periodTo: Date;
  totalDebit: number;
  totalRefund: number;
  totalAdjustment: number;
  netAmount: number;
  currency: string;
  status: TenantInvoiceStatus;
  fileKey: string | null;
  previousInvoiceId: string | null;
  generatedByUserId: string | null;
  generatedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TenantInvoiceEntity extends BaseEntity {
  readonly tenantId: string;
  readonly periodFrom: Date;
  readonly periodTo: Date;
  totalDebit: number;
  totalRefund: number;
  totalAdjustment: number;
  netAmount: number;
  readonly currency: string;
  status: TenantInvoiceStatus;
  fileKey: string | null;
  readonly previousInvoiceId: string | null;
  generatedByUserId: string | null;
  generatedAt: Date | null;
  notes: string | null;

  constructor(props: TenantInvoiceProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.periodFrom = props.periodFrom;
    this.periodTo = props.periodTo;
    this.totalDebit = props.totalDebit;
    this.totalRefund = props.totalRefund;
    this.totalAdjustment = props.totalAdjustment;
    this.netAmount = props.netAmount;
    this.currency = props.currency;
    this.status = props.status;
    this.fileKey = props.fileKey;
    this.previousInvoiceId = props.previousInvoiceId;
    this.generatedByUserId = props.generatedByUserId;
    this.generatedAt = props.generatedAt;
    this.notes = props.notes;
  }

  isClosed(): boolean {
    return this.status === 'CLOSED';
  }

  isPaid(): boolean {
    return this.status === 'PAID';
  }

  isSuperseded(): boolean {
    return this.status === 'SUPERSEDED';
  }

  canBeRegenerated(): boolean {
    return this.status === 'CLOSED' || this.status === 'PAID';
  }
}
