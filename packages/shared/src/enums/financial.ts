export const FinancialEntryType = {
  TENANT_DEBIT: 'TENANT_DEBIT',
  INSPECTOR_PAYOUT: 'INSPECTOR_PAYOUT',
  REFUND: 'REFUND',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
} as const;
export type FinancialEntryType = (typeof FinancialEntryType)[keyof typeof FinancialEntryType];

export const FinancialEntryStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CANCELLED: 'CANCELLED',
  VOIDED: 'VOIDED',
} as const;
export type FinancialEntryStatus = (typeof FinancialEntryStatus)[keyof typeof FinancialEntryStatus];

export const BillingPeriodType = {
  WEEKLY: 'WEEKLY',
  FORTNIGHTLY: 'FORTNIGHTLY',
  MONTHLY: 'MONTHLY',
} as const;
export type BillingPeriodType = (typeof BillingPeriodType)[keyof typeof BillingPeriodType];

export const InspectorInvoiceStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  // OPEN and SUPERSEDED are legacy values retained only until the destructive cleanup batch.
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  PAID: 'PAID',
  SUPERSEDED: 'SUPERSEDED',
  VOID: 'VOID',
} as const;
export type InspectorInvoiceStatus = (typeof InspectorInvoiceStatus)[keyof typeof InspectorInvoiceStatus];

/**
 * Product-facing 3-bucket status filter for inspector Property Invoices (spec 032):
 * Pending = PENDING_REVIEW, Approved = CLOSED | PAID, Rejected = VOID.
 * PAID is an internal payment state shown as a complementary badge, not a separate bucket.
 */
export const INVOICE_STATUS_BUCKETS = {
  pending: ['PENDING_REVIEW'],
  approved: ['CLOSED', 'PAID'],
  rejected: ['VOID'],
} as const;
export type InvoiceStatusBucket = keyof typeof INVOICE_STATUS_BUCKETS;
