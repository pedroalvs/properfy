import type { Prisma } from '@prisma/client';
import type { InspectorInvoiceEntity } from './inspector-invoice.entity';
import type { InspectorInvoiceStatus, InvoiceSnapshotLine } from '@properfy/shared';

export interface InvoiceFilters {
  inspectorId?: string;
  status?: InspectorInvoiceStatus;
  /** Persisted statuses to match (from a product status bucket). */
  statusIn?: InspectorInvoiceStatus[];
  /** Content filter: invoices whose snapshot has ≥1 line for this agency (tenant). */
  agencyId?: string;
  /** Content filter: invoices whose snapshot has ≥1 line for this branch. */
  branchId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface InvoicePagination {
  page: number;
  pageSize: number;
}

export interface InvoiceUpdateData {
  status?: string;
  invoiceNumber?: number | null;
  inspectorName?: string | null;
  lineItemsSnapshot?: InvoiceSnapshotLine[] | null;
  fileKey?: string | null;
  generatedByUserId?: string | null;
  issuedAt?: Date | null;
  paidAt?: Date | null;
  paidByUserId?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
}

export interface ReconciliationAggregateFilters {
  from: Date;
  to: Date;
  inspectorId?: string;
}

export interface ReconciliationAggregateRow {
  status: InspectorInvoiceStatus;
  currency: string;
  sumAmount: number;
  count: number;
}

export interface StatusAggregateFilters {
  inspectorId?: string;
  /** Content filter: invoices whose snapshot has ≥1 line for this agency (tenant). */
  agencyId?: string;
  /** Content filter: invoices whose snapshot has ≥1 line for this branch. */
  branchId?: string;
  /** Inclusive period_start lower bound. */
  from?: Date;
  /** Inclusive period_start upper bound. */
  to?: Date;
}

export interface IInspectorInvoiceRepository {
  findById(id: string): Promise<InspectorInvoiceEntity | null>;
  findByInspectorAndPeriod(inspectorId: string, periodStart: Date, periodEnd: Date): Promise<InspectorInvoiceEntity | null>;
  /**
   * Finds an ACTIVE invoice (PENDING_REVIEW / CLOSED / PAID) for the exact (inspector, period).
   * VOID/SUPERSEDED are excluded so a rejected request can be re-submitted. Enforces the
   * one-active-invoice-per-period rule at the application layer until the partial unique index lands.
   */
  findActiveByInspectorAndPeriod(inspectorId: string, periodStart: Date, periodEnd: Date): Promise<InspectorInvoiceEntity | null>;
  findAll(filters: InvoiceFilters, pagination: InvoicePagination): Promise<InspectorInvoiceEntity[]>;
  findManyByIds(ids: string[]): Promise<InspectorInvoiceEntity[]>;
  count(filters: InvoiceFilters): Promise<number>;
  save(invoice: InspectorInvoiceEntity): Promise<void>;
  update(id: string, data: InvoiceUpdateData): Promise<void>;
  deleteById(id: string): Promise<void>;
  /**
   * Atomically transitions PENDING_REVIEW → CLOSED, assigning the next sequence number and freezing
   * the snapshot / total / inspector name / issued_at in one transaction. Returns the assigned
   * number, or null if the invoice was no longer PENDING_REVIEW (lost an approval race); the
   * consumed sequence value becomes a gap in that case. (spec 032)
   */
  assignNumberAndFreeze(
    invoiceId: string,
    params: {
      lineItemsSnapshot: InvoiceSnapshotLine[];
      totalAmount: number;
      inspectorName: string | null;
      inspectorAbn: string | null;
      issuedAt: Date;
      generatedByUserId: string;
    },
    /**
     * Q12 (F08-6): runs inside the freeze transaction, after the PENDING_REVIEW → CLOSED update
     * succeeds, to link the period's approved rewards to this invoice. Throwing (e.g.
     * `InvoiceLinesChangedError` on a count mismatch) rolls the whole freeze back.
     */
    linkRewards?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<number | null>;
  /**
   * Q12 (F08-6): atomically CAS CLOSED → PAID and run `afterPaid` inside the same transaction
   * (to mark the invoice's rewards PAID). Returns true iff this call performed the transition.
   */
  markPaidInTransaction(
    invoiceId: string,
    params: { paidAt: Date; paidByUserId: string; paymentReference: string | null },
    afterPaid?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<boolean>;
  /**
   * Q12 (F08-6): atomically CAS PAID → CLOSED (clearing the payment fields) and run `afterReverted`
   * inside the same transaction (to return the invoice's rewards to APPROVED). Returns true iff this
   * call performed the transition.
   */
  reversePaymentInTransaction(
    invoiceId: string,
    afterReverted?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<boolean>;
  /**
   * Atomically transitions PENDING_REVIEW → VOID with the reason via a conditional update, so a
   * concurrent approval cannot be silently overwritten. Returns true iff this call performed the
   * transition (0 rows → lost the race to an approve/reject). (spec 032)
   */
  voidIfPendingReview(invoiceId: string, reason: string): Promise<boolean>;
  /**
   * Returns raw aggregate rows grouped by (status, currency) filtered by issuedAt range.
   * Only includes invoices in CLOSED or PAID status.
   * The use case layer is responsible for detecting multi-currency scope and summing per status.
   */
  getReconciliationAggregates(filters: ReconciliationAggregateFilters): Promise<ReconciliationAggregateRow[]>;
  /**
   * Returns aggregate rows grouped by (status, currency) across ALL statuses, with every filter
   * optional. Filter semantics mirror findAll (agency/branch are snapshot content filters,
   * from/to range on period_start). Used by the Invoices page summary indicators.
   */
  getStatusAggregates(filters: StatusAggregateFilters): Promise<ReconciliationAggregateRow[]>;
}
