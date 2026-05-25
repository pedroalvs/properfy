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

// Draft invoice (Feedback Round item 5 — FR-060)
export const draftInvoiceSchema = z.object({
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
}).refine(
  (data) => data.periodEnd > data.periodStart,
  { message: 'periodEnd must be after periodStart', path: ['periodEnd'] },
);
export type DraftInvoiceInput = z.infer<typeof draftInvoiceSchema>;
