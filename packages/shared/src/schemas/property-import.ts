import { z } from 'zod';
import {
  importPropertyPlanSchema,
  importRowIssueSchema,
  importSummarySchema,
  IMPORT_ROW_SEVERITY,
} from './import';

/**
 * Single source of truth for the property-import preview/commit contract,
 * mirroring the appointment-import contract in `./appointment-import`.
 * Produced by the property row resolver (application/services/
 * property-import-row-resolver.ts) and consumed unchanged by the preview
 * endpoint and the `previewJson` field on the status endpoint.
 */

/** One resolved spreadsheet row: normalized fields, the resolved property
 * plan (with geocode verification for new addresses), and every issue found.
 * `property` is null only when the row is too broken to plan (e.g. no street
 * at all) — the row is then `importable: false`. */
export const resolvedPropertyImportRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  severity: z.enum(IMPORT_ROW_SEVERITY),
  importable: z.boolean(),
  propertyCode: z.string().nullable(),
  type: z.string().nullable(),
  notes: z.string().nullable(),
  property: importPropertyPlanSchema.nullable(),
  issues: z.array(importRowIssueSchema),
});
export type ResolvedPropertyImportRow = z.infer<typeof resolvedPropertyImportRowSchema>;

/** Response body of `POST /v1/properties/import/preview`, and the value of
 * `previewJson` on the extended status response. */
export const propertyImportPreviewResponseSchema = z.object({
  importId: z.string().uuid(),
  tenantId: z.string().uuid(),
  summary: importSummarySchema,
  rows: z.array(resolvedPropertyImportRowSchema),
});
export type PropertyImportPreviewResponse = z.infer<typeof propertyImportPreviewResponseSchema>;

/** Request body of `POST /v1/properties/import/:importId/commit`. */
export const commitPropertyImportSchema = z.object({
  skipInvalidRows: z.boolean().default(false),
});
export type CommitPropertyImportInput = z.infer<typeof commitPropertyImportSchema>;
