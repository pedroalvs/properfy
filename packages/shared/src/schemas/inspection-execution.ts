import { z } from 'zod';

export const inspectorScheduleQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
});

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
  kind: z.enum(['PHOTO', 'DOCUMENT', 'SIGNATURE']),
  mimeType: z.string().min(1),
  fileName: z.string().min(1).max(255),
});

export type RequestAssetUploadInput = z.infer<typeof requestAssetUploadSchema>;

export const saveExecutionProgressSchema = z.object({
  checklistJson: z.record(z.unknown()).optional(),
  notes: z.string().max(5000).optional(),
});

export type SaveExecutionProgressInput = z.infer<typeof saveExecutionProgressSchema>;
