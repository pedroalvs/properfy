import { z } from 'zod';

export const reportFiltersSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
  tenantId: z.string().uuid().optional(),
  serviceTypeId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  inspectorId: z.string().uuid().optional(),
  status: z.string().optional(),
  tenantConfirmationStatus: z.string().optional(),
  search: z.string().max(200).optional(),
  emailNotificationStatus: z.string().optional(),
}).refine(
  (f) => new Date(f.toDate) >= new Date(f.fromDate),
  { message: 'toDate must be >= fromDate', path: ['toDate'] },
);

export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export const requestReportSchema = z.object({
  reportType: z.enum([
    'INSPECTIONS_SCHEDULED',
    'INSPECTIONS_DONE',
    'INSPECTIONS_CANCELLED',
    'INSPECTIONS_REJECTED',
    'INSPECTOR_PERFORMANCE',
    'CONFIRMATION_STATUS',
    'FINANCIAL_SERVICES',
  ]),
  filters: reportFiltersSchema,
  format: z.literal('XLSX').default('XLSX'),
});

export type RequestReportInput = z.infer<typeof requestReportSchema>;

export const listReportsQuerySchema = z.object({
  reportType: z.enum([
    'INSPECTIONS_SCHEDULED',
    'INSPECTIONS_DONE',
    'INSPECTIONS_CANCELLED',
    'INSPECTIONS_REJECTED',
    'INSPECTOR_PERFORMANCE',
    'CONFIRMATION_STATUS',
    'FINANCIAL_SERVICES',
  ]).optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
