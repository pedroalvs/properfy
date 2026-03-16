export const FinancialEntryType = {
  TENANT_DEBIT: 'TENANT_DEBIT',
  INSPECTOR_PAYOUT: 'INSPECTOR_PAYOUT',
  REFUND: 'REFUND',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
} as const;
export type FinancialEntryType = (typeof FinancialEntryType)[keyof typeof FinancialEntryType];

export const FinancialEntryStatus = {
  PENDING: 'PENDING',
  PROCESSED: 'PROCESSED',
  CANCELLED: 'CANCELLED',
} as const;
export type FinancialEntryStatus = (typeof FinancialEntryStatus)[keyof typeof FinancialEntryStatus];

export const BillingPeriod = {
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
} as const;
export type BillingPeriod = (typeof BillingPeriod)[keyof typeof BillingPeriod];

export const InspectorInvoiceStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  PAID: 'PAID',
} as const;
export type InspectorInvoiceStatus = (typeof InspectorInvoiceStatus)[keyof typeof InspectorInvoiceStatus];
