import { z } from 'zod';
import { ImportStatus } from '../enums/import';

export const importErrorSchema = z.object({
  row: z.number().int().positive(),
  field: z.string().optional(),
  message: z.string(),
});
export type ImportError = z.infer<typeof importErrorSchema>;

export const importStatusResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.nativeEnum(ImportStatus),
  totalRows: z.number().int().min(0),
  successCount: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  errors: z.array(importErrorSchema).optional().nullable(),
  createdAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional().nullable(),
});
export type ImportStatusResponse = z.infer<typeof importStatusResponseSchema>;
