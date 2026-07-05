import { z } from 'zod';

export const listFinancialEntriesQuerySchema = z.object({
  type: z.enum(['TENANT_DEBIT', 'INSPECTOR_PAYOUT', 'REFUND', 'MANUAL_ADJUSTMENT']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'CANCELLED', 'VOIDED']).optional(),
  inspectorId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['effectiveAt', 'amount', 'createdAt']).default('effectiveAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ListFinancialEntriesQuery = z.infer<typeof listFinancialEntriesQuerySchema>;

export const createManualAdjustmentSchema = z.object({
  tenantId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  inspectorId: z.string().uuid().optional(),
  amount: z.number().positive(),
  description: z.string().min(1).max(500),
  reason: z.string().min(1).max(1000),
  effectiveAt: z.string().datetime().optional(),
  referenceEntryId: z.string().uuid().optional(),
});
export type CreateManualAdjustmentInput = z.infer<typeof createManualAdjustmentSchema>;

export const createRefundSchema = z.object({
  description: z.string().min(1).max(500),
  reason: z.string().min(1).max(1000),
  amount: z.number().positive().optional(),
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;


export const cancelFinancialEntrySchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type CancelFinancialEntryInput = z.infer<typeof cancelFinancialEntrySchema>;

export const markInvoicePaidSchema = z.object({
  paidAt: z.string().datetime().optional(),
  paymentReference: z.string().max(255).optional(),
});
export type MarkInvoicePaidInput = z.infer<typeof markInvoicePaidSchema>;

export const batchMarkInvoicesPaidSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(100),
  paidAt: z.string().datetime().optional(),
  paymentReference: z.string().max(255).optional(),
});
export type BatchMarkInvoicesPaidInput = z.infer<typeof batchMarkInvoicesPaidSchema>;

export const batchMarkInvoicesPaidResponseSchema = z.object({
  processed: z.array(
    z.object({
      id: z.string().uuid(),
      status: z.literal('PAID'),
    }),
  ),
  skipped: z.array(
    z.object({
      id: z.string().uuid(),
      reason: z.enum(['ALREADY_PAID', 'NOT_CLOSED', 'NOT_FOUND', 'TENANT_SCOPE']),
    }),
  ),
});
export type BatchMarkInvoicesPaidResponse = z.infer<typeof batchMarkInvoicesPaidResponseSchema>;

export const reverseInvoicePaymentSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type ReverseInvoicePaymentInput = z.infer<typeof reverseInvoicePaymentSchema>;

export const reconciliationSummaryQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  inspectorId: z.string().uuid().optional(),
}).refine(
  (d) => new Date(d.to) >= new Date(d.from),
  { message: 'to must be >= from' },
);
export type ReconciliationSummaryQuery = z.infer<typeof reconciliationSummaryQuerySchema>;

export const reconciliationSummaryResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  inspectorId: z.string().uuid().nullable(),
  currency: z.string().length(3),
  totalInvoicedAmount: z.number(),
  totalPaidAmount: z.number(),
  totalUnpaidAmount: z.number(),
  paidCount: z.number().int().nonnegative(),
  unpaidCount: z.number().int().nonnegative(),
});
export type ReconciliationSummaryResponse = z.infer<typeof reconciliationSummaryResponseSchema>;

export const rejectDraftInvoiceSchema = z.object({
  reason: z.string().min(10).max(1000),
});
export type RejectDraftInvoiceInput = z.infer<typeof rejectDraftInvoiceSchema>;

export const listInvoicesQuerySchema = z.object({
  inspectorId: z.string().uuid().optional(),
  // Content filters (spec 032): match invoices whose frozen snapshot has ≥1 line for the agency/branch.
  agencyId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  // 3-bucket status filter (Pending / Approved / Rejected) plus 'done' = everything not pending.
  status: z.enum(['pending', 'approved', 'rejected', 'done']).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

export const invoiceSummaryQuerySchema = z.object({
  inspectorId: z.string().uuid().optional(),
  // Content filters (spec 032): same semantics as listInvoicesQuerySchema.
  agencyId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
}).refine(
  (d) => !d.fromDate || !d.toDate || new Date(d.toDate) >= new Date(d.fromDate),
  { message: 'toDate must be >= fromDate' },
);
export type InvoiceSummaryQuery = z.infer<typeof invoiceSummaryQuerySchema>;

export const invoiceSummaryResponseSchema = z.object({
  currency: z.string().length(3),
  totalCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  paidCount: z.number().int().nonnegative(),
  voidCount: z.number().int().nonnegative(),
  pendingAmount: z.number(),
  paidAmount: z.number(),
});
export type InvoiceSummaryResponse = z.infer<typeof invoiceSummaryResponseSchema>;

export const voidFinancialEntrySchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type VoidFinancialEntryInput = z.infer<typeof voidFinancialEntrySchema>;

