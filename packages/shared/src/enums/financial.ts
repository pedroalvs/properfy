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
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
} as const;
export type BillingPeriodType = (typeof BillingPeriodType)[keyof typeof BillingPeriodType];

export const InspectorInvoiceStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  PAID: 'PAID',
  SUPERSEDED: 'SUPERSEDED',
} as const;
export type InspectorInvoiceStatus = (typeof InspectorInvoiceStatus)[keyof typeof InspectorInvoiceStatus];

export const TenantInvoiceStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  PAID: 'PAID',
  SUPERSEDED: 'SUPERSEDED',
} as const;
export type TenantInvoiceStatus = (typeof TenantInvoiceStatus)[keyof typeof TenantInvoiceStatus];
