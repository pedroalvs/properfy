import { BaseEntity } from '../../../shared/domain/entity';
import type { InspectorInvoiceStatus, BillingPeriodType, InvoiceSnapshotLine } from '@properfy/shared';
import { ACTIVE_INVOICE_STATUSES } from '@properfy/shared';

export interface InspectorInvoiceProps {
  id: string;
  invoiceNumber: number | null;
  inspectorId: string;
  inspectorName?: string | null;
  periodStart: Date;
  periodEnd: Date;
  periodType: BillingPeriodType;
  status: InspectorInvoiceStatus;
  totalAmount: number;
  currency: string;
  lineItemsSnapshot: InvoiceSnapshotLine[] | null;
  fileKey: string | null;
  generatedByUserId: string | null;
  issuedAt: Date | null;
  paidAt: Date | null;
  paidByUserId: string | null;
  paymentReference: string | null;
  notes: string | null;
  draftedByInspectorId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Parameters frozen onto an invoice when an operator approves it. */
export interface AssignNumberAndFreezeParams {
  invoiceNumber: number;
  lineItemsSnapshot: InvoiceSnapshotLine[];
  totalAmount: number;
  inspectorName: string | null;
  issuedAt: Date;
  generatedByUserId: string;
}

export class InspectorInvoiceEntity extends BaseEntity {
  invoiceNumber: number | null;
  readonly inspectorId: string;
  inspectorName: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly periodType: BillingPeriodType;
  status: InspectorInvoiceStatus;
  totalAmount: number;
  readonly currency: string;
  lineItemsSnapshot: InvoiceSnapshotLine[] | null;
  fileKey: string | null;
  generatedByUserId: string | null;
  issuedAt: Date | null;
  paidAt: Date | null;
  paidByUserId: string | null;
  paymentReference: string | null;
  notes: string | null;
  readonly draftedByInspectorId: string | null;

  constructor(props: InspectorInvoiceProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.invoiceNumber = props.invoiceNumber;
    this.inspectorId = props.inspectorId;
    this.inspectorName = props.inspectorName ?? null;
    this.periodStart = props.periodStart;
    this.periodEnd = props.periodEnd;
    this.periodType = props.periodType;
    this.status = props.status;
    this.totalAmount = props.totalAmount;
    this.currency = props.currency;
    this.lineItemsSnapshot = props.lineItemsSnapshot;
    this.fileKey = props.fileKey;
    this.generatedByUserId = props.generatedByUserId;
    this.issuedAt = props.issuedAt;
    this.paidAt = props.paidAt;
    this.paidByUserId = props.paidByUserId;
    this.paymentReference = props.paymentReference;
    this.notes = props.notes;
    this.draftedByInspectorId = props.draftedByInspectorId;
  }

  isPendingReview(): boolean {
    return this.status === 'PENDING_REVIEW';
  }

  isClosed(): boolean {
    return this.status === 'CLOSED';
  }

  isPaid(): boolean {
    return this.status === 'PAID';
  }

  isVoid(): boolean {
    return this.status === 'VOID';
  }

  /**
   * An invoice is ACTIVE when it participates in the (inspector, period) uniqueness rule.
   * VOID (and the legacy SUPERSEDED) are excluded so a rejected request can be re-submitted.
   */
  isActive(): boolean {
    return (ACTIVE_INVOICE_STATUSES as readonly string[]).includes(this.status);
  }

  isReady(): boolean {
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
   * Approval transition: PENDING_REVIEW → CLOSED. Freezes the snapshot, total and inspector name,
   * assigns the sequential number and stamps issued_at. The caller (repository) is responsible for
   * obtaining the number atomically (sequence nextval inside the approval transaction).
   */
  assignNumberAndFreeze(params: AssignNumberAndFreezeParams): void {
    if (this.status !== 'PENDING_REVIEW') {
      throw new Error(`Cannot approve invoice ${this.id}: current status is ${this.status}`);
    }
    this.status = 'CLOSED';
    this.invoiceNumber = params.invoiceNumber;
    this.lineItemsSnapshot = params.lineItemsSnapshot;
    this.totalAmount = params.totalAmount;
    this.inspectorName = params.inspectorName;
    this.issuedAt = params.issuedAt;
    this.generatedByUserId = params.generatedByUserId;
  }

  /**
   * Rejection transition: PENDING_REVIEW → VOID with a required reason. The row is retained
   * (never hard-deleted). The reason is stored in notes.
   */
  void(reason: string): void {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new Error(`Cannot reject invoice ${this.id}: a reason is required`);
    }
    if (this.status !== 'PENDING_REVIEW') {
      throw new Error(`Cannot reject invoice ${this.id}: current status is ${this.status}`);
    }
    this.status = 'VOID';
    this.notes = trimmedReason;
  }

  /**
   * Transitions the invoice from CLOSED to PAID.
   * Caller is responsible for validating paidAt (not in future, not before issuedAt)
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
