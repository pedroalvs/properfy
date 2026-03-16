import { BaseEntity } from '../../../shared/domain/entity';
import type { InspectorInvoiceStatus, BillingPeriodType } from '@properfy/shared';

export interface InspectorInvoiceProps {
  id: string;
  inspectorId: string;
  periodStart: Date;
  periodEnd: Date;
  periodType: BillingPeriodType;
  status: InspectorInvoiceStatus;
  totalAmount: number;
  currency: string;
  fileKey: string | null;
  generatedByUserId: string | null;
  generatedAt: Date | null;
  paidAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class InspectorInvoiceEntity extends BaseEntity {
  readonly inspectorId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly periodType: BillingPeriodType;
  status: InspectorInvoiceStatus;
  totalAmount: number;
  readonly currency: string;
  fileKey: string | null;
  generatedByUserId: string | null;
  generatedAt: Date | null;
  paidAt: Date | null;
  notes: string | null;

  constructor(props: InspectorInvoiceProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.inspectorId = props.inspectorId;
    this.periodStart = props.periodStart;
    this.periodEnd = props.periodEnd;
    this.periodType = props.periodType;
    this.status = props.status;
    this.totalAmount = props.totalAmount;
    this.currency = props.currency;
    this.fileKey = props.fileKey;
    this.generatedByUserId = props.generatedByUserId;
    this.generatedAt = props.generatedAt;
    this.paidAt = props.paidAt;
    this.notes = props.notes;
  }

  isClosed(): boolean {
    return this.status === 'CLOSED';
  }

  isPaid(): boolean {
    return this.status === 'PAID';
  }

  isReady(): boolean {
    return this.status === 'CLOSED' || this.status === 'PAID';
  }

  hasFile(): boolean {
    return this.fileKey !== null;
  }
}
