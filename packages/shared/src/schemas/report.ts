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
  format: z.enum(['XLSX', 'CSV', 'PDF']).default('XLSX'),
  columns: z.array(z.string().min(1).max(100)).min(1).max(50).optional(),
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

// ─── Scheduled Reports (Feature 019) ──────────────────────────────────────

const reportTypeEnum = z.enum([
  'INSPECTIONS_SCHEDULED',
  'INSPECTIONS_DONE',
  'INSPECTIONS_CANCELLED',
  'INSPECTIONS_REJECTED',
  'INSPECTOR_PERFORMANCE',
  'CONFIRMATION_STATUS',
  'FINANCIAL_SERVICES',
]);

export const scheduleDeliveryModeSchema = z.enum(['OWNER_ONLY', 'RECIPIENT_LIST', 'TENANT_WIDE']);
export type ScheduleDeliveryMode = z.infer<typeof scheduleDeliveryModeSchema>;

export const scheduleStatusSchema = z.enum(['ACTIVE', 'PAUSED']);
export type ScheduleStatus = z.infer<typeof scheduleStatusSchema>;

export const scheduleRunStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'skipped_catchup',
  'skipped_empty',
]);
export type ScheduleRunStatus = z.infer<typeof scheduleRunStatusSchema>;

/**
 * Feature 019: structured recurrence — the UX-facing representation of a schedule's
 * cadence. Mapped to a cron expression at the backend use-case boundary to keep the
 * existing cron-parser as the storage format.
 */
export const structuredRecurrenceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('daily'),
    hour: z.number().int().min(0).max(23),
  }),
  z.object({
    type: z.literal('weekly'),
    dayOfWeek: z.number().int().min(0).max(6), // 0 = Sunday
    hour: z.number().int().min(0).max(23),
  }),
  z.object({
    type: z.literal('monthly'),
    dayOfMonth: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
  }),
]);
export type StructuredRecurrence = z.infer<typeof structuredRecurrenceSchema>;

export const createScheduledReportSchema = z
  .object({
    reportType: reportTypeEnum,
    filtersJson: z.record(z.unknown()).default({}),
    format: z.enum(['XLSX', 'CSV', 'PDF']).default('XLSX'),
    recurrence: structuredRecurrenceSchema.optional(),
    /** @deprecated — use `recurrence` instead. Accepted for back-compat with pre-019 callers. */
    cronExpression: z.string().min(9).max(100).optional(),
    deliveryMode: scheduleDeliveryModeSchema.default('OWNER_ONLY'),
    recipientUserIds: z.array(z.string().uuid()).max(50).default([]),
    displayName: z.string().max(120).optional(),
    skipDeliveryWhenEmpty: z.boolean().default(false),
    /** AM only: explicit tenant scope when JWT tenantId is null. */
    tenantId: z.string().uuid().optional(),
  })
  .refine((v) => v.recurrence !== undefined || v.cronExpression !== undefined, {
    message: 'Either `recurrence` or `cronExpression` is required',
    path: ['recurrence'],
  });
export type CreateScheduledReportInput = z.infer<typeof createScheduledReportSchema>;

export const updateScheduledReportSchema = z
  .object({
    filtersJson: z.record(z.unknown()).optional(),
    recurrence: structuredRecurrenceSchema.optional(),
    deliveryMode: scheduleDeliveryModeSchema.optional(),
    recipientUserIds: z.array(z.string().uuid()).max(50).optional(),
    displayName: z.string().max(120).optional(),
    skipDeliveryWhenEmpty: z.boolean().optional(),
  })
  .refine(
    (v) => Object.values(v).some((x) => x !== undefined),
    { message: 'At least one field must be provided' },
  );
export type UpdateScheduledReportInput = z.infer<typeof updateScheduledReportSchema>;

export const pauseScheduleSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type PauseScheduleInput = z.infer<typeof pauseScheduleSchema>;

export const reassignOwnershipSchema = z.object({
  newOwnerUserId: z.string().uuid(),
  reason: z.string().min(1).max(1000),
});
export type ReassignOwnershipInput = z.infer<typeof reassignOwnershipSchema>;

export const listScheduledReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: scheduleStatusSchema.optional(),
});
export type ListScheduledReportsQuery = z.infer<typeof listScheduledReportsQuerySchema>;

export const listScheduleRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: scheduleRunStatusSchema.optional(),
});
export type ListScheduleRunsQuery = z.infer<typeof listScheduleRunsQuerySchema>;

export const scheduledReportRunResponseSchema = z.object({
  id: z.string().uuid(),
  scheduleId: z.string().uuid(),
  reportId: z.string().uuid().nullable(),
  status: scheduleRunStatusSchema,
  scheduledFor: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable(),
  recipientCount: z.number().int().nullable(),
  deliveryStatusJson: z.array(z.record(z.unknown())).nullable(),
  createdAt: z.string().datetime(),
});
export type ScheduledReportRunResponse = z.infer<typeof scheduledReportRunResponseSchema>;
