import { z } from 'zod';

export const inspectorScheduleQuerySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
    status: z.enum(['DONE']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine(
    (q) => !(q.date && (q.from ?? q.to)),
    { message: 'Use either date (single-day mode) or from/to (range mode), not both.' },
  );

export type InspectorScheduleQuery = z.infer<typeof inspectorScheduleQuerySchema>;

export const inspectorScheduleMonthQuerySchema = z.object({}).strict();
export type InspectorScheduleMonthQuery = z.infer<typeof inspectorScheduleMonthQuerySchema>;

export const startInspectionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type StartInspectionInput = z.infer<typeof startInspectionSchema>;

export const finishInspectionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  checklistJson: z.record(z.unknown()).optional(),
  notes: z.string().max(5000).optional(),
  assets: z.array(z.object({
    assetId: z.string().uuid(),
    storageKey: z.string().min(1),
  })).optional().default([]),
});

export type FinishInspectionInput = z.infer<typeof finishInspectionSchema>;

export const reopenExecutionSchema = z.object({
  reason: z.string().min(1).max(1000).trim(),
});

export type ReopenExecutionInput = z.infer<typeof reopenExecutionSchema>;

export const requestAssetUploadSchema = z.object({
  // DOCUMENT/SIGNATURE are reserved in the DB enum but not yet supported in the execution flow
  kind: z.literal('PHOTO'),
  mimeType: z.string().min(1),
  fileName: z.string().min(1).max(255),
});

export type RequestAssetUploadInput = z.infer<typeof requestAssetUploadSchema>;

export const saveExecutionProgressSchema = z.object({
  checklistJson: z.record(z.unknown()).optional(),
  notes: z.string().max(5000).optional(),
});

export type SaveExecutionProgressInput = z.infer<typeof saveExecutionProgressSchema>;

// ─── Inspector Property Invoice request flow (spec 032) ───────────────────

/** Query for the list of selectable closed periods for the inspector's cycle. */
export const availablePeriodsQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(24).default(6),
});
export type AvailablePeriodsQuery = z.infer<typeof availablePeriodsQuerySchema>;

/** Query for a live preview of a chosen closed period (total, count, currency). */
export const previewInvoiceQuerySchema = z.object({
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
}).refine(
  // Same invariant as requestInvoiceSchema, so a preview can't accept a reversed range that the
  // subsequent request would reject (avoids a confusing preview/request UX mismatch).
  (data) => data.periodEnd > data.periodStart,
  { message: 'periodEnd must be after periodStart', path: ['periodEnd'] },
);
export type PreviewInvoiceQuery = z.infer<typeof previewInvoiceQuerySchema>;

/** Body to confirm a request for a chosen closed period. */
export const requestInvoiceSchema = z.object({
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
}).refine(
  (data) => data.periodEnd > data.periodStart,
  { message: 'periodEnd must be after periodStart', path: ['periodEnd'] },
);
export type RequestInvoiceInput = z.infer<typeof requestInvoiceSchema>;

// ─── Inspector earnings summary ────────────────────────────────────────────

/** Query for the inspector's own earnings summary (totals + monthly series). */
export const inspectorEarningsSummaryQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});
export type InspectorEarningsSummaryQuery = z.infer<typeof inspectorEarningsSummaryQuerySchema>;
