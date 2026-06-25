import { BaseEntity } from '../../../shared/domain/entity';
import type { InspectorInvoiceStatus, BillingPeriodType } from '@properfy/shared';

export interface InspectorInvoiceProps {
  id: string;
  inspectorId: string;
  inspectorName?: string | null;
  periodStart: Date;
  periodEnd: Date;
  periodType: BillingPeriodType;
  status: InspectorInvoiceStatus;
  totalAmount: number;
  currency: string;
  fileKey: string | null;
  previousInvoiceId: string | null;
  generatedByUserId: string | null;
  generatedAt: Date | null;
  paidAt: Date | null;
  paidByUserId: string | null;
  paymentReference: string | null;
  notes: string | null;
  draftedByInspectorId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class InspectorInvoiceEntity extends BaseEntity {
  readonly inspectorId: string;
  readonly inspectorName: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly periodType: BillingPeriodType;
  status: InspectorInvoiceStatus;
  totalAmount: number;
  readonly currency: string;
  fileKey: string | null;
  readonly previousInvoiceId: string | null;
  generatedByUserId: string | null;
  generatedAt: Date | null;
  paidAt: Date | null;
  paidByUserId: string | null;
  paymentReference: string | null;
  notes: string | null;
  readonly draftedByInspectorId: string | null;

  constructor(props: InspectorInvoiceProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.inspectorId = props.inspectorId;
    this.inspectorName = props.inspectorName ?? null;
    this.periodStart = props.periodStart;
    this.periodEnd = props.periodEnd;
    this.periodType = props.periodType;
    this.status = props.status;
    this.totalAmount = props.totalAmount;
    this.currency = props.currency;
    this.fileKey = props.fileKey;
    this.previousInvoiceId = props.previousInvoiceId;
    this.generatedByUserId = props.generatedByUserId;
    this.generatedAt = props.generatedAt;
    this.paidAt = props.paidAt;
    this.paidByUserId = props.paidByUserId;
    this.paymentReference = props.paymentReference;
    this.notes = props.notes;
    this.draftedByInspectorId = props.draftedByInspectorId;
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

  isSuperseded(): boolean {
    return this.status === 'SUPERSEDED';
  }

  canBeRegenerated(): boolean {
    return this.status === 'CLOSED' || this.status === 'PAID';
  }

  canBeMarkedPaid(): boolean {
    return this.status === 'CLOSED';
  }

  canBeReversed(): boolean {
    return this.status === 'PAID';
  }

  hasFile(): boolean {
    return this.fileKey !== null;
  }

  /**
   * Transitions the invoice from CLOSED to PAID.
   * Caller is responsible for validating paidAt (not in future, not before generatedAt)
   * and actor role before invoking this method.
   */
  markPaid(paidAt: Date, paidByUserId: string, paymentReference: string | null): void {
    if (!this.canBeMarkedPaid()) {
      throw new Error(`Cannot mark invoice ${this.id} as paid: current status is ${this.status}`);
    }
    this.status = 'PAID';
    this.paidAt = paidAt;
    this.paidByUserId = paidByUserId;
    this.paymentReference = paymentReference;
  }

  /**
   * Transitions the invoice from PAID back to CLOSED, clearing all payment fields.
   * Caller is responsible for audit logging with reason.
   */
  reversePayment(): void {
    if (!this.canBeReversed()) {
      throw new Error(`Cannot reverse payment on invoice ${this.id}: current status is ${this.status}`);
    }
    this.status = 'CLOSED';
    this.paidAt = null;
    this.paidByUserId = null;
    this.paymentReference = null;
  }
}
