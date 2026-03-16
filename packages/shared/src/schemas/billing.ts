import { z } from 'zod';

export const listFinancialEntriesQuerySchema = z.object({
  type: z.enum(['TENANT_DEBIT', 'INSPECTOR_PAYOUT', 'REFUND', 'MANUAL_ADJUSTMENT']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'CANCELLED']).optional(),
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
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;

export const generateInvoiceSchema = z.object({
  inspectorId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine(
  (d) => new Date(d.periodEnd) >= new Date(d.periodStart),
  { message: 'periodEnd must be >= periodStart' }
);
export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>;

export const listInvoicesQuerySchema = z.object({
  inspectorId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'CLOSED', 'PAID']).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
