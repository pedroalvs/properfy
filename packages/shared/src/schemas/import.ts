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

/**
 * Generic building blocks of the preview/commit import contract, shared by the
 * appointment and property importers. Both the backend route `response`
 * schemas and the web preview UIs infer their types from these — see
 * `project_fastify_response_schema_serializer_throws` (a hand-written type
 * that drifts from the actual payload throws a 500 in the serializer, not a
 * type error).
 */

export const IMPORT_ROW_SEVERITY = ['ready', 'warning', 'error'] as const;
export type ImportRowSeverity = (typeof IMPORT_ROW_SEVERITY)[number];

/** A single problem or applied-default found on a row, with a stable `code`
 * for tests/i18n and a human `message` for the preview UI. */
export const importRowIssueSchema = z.object({
  field: z.string(),
  code: z.string(),
  severity: z.enum(['warning', 'error']),
  message: z.string(),
});
export type ImportRowIssue = z.infer<typeof importRowIssueSchema>;

/**
 * Outcome of the synchronous geocode check run during preview for addresses
 * that will create a new property. `found` carries the coordinates so commit
 * can persist them without geocoding again; `not_found` means the provider
 * returned no match (property will be created as FAILED); `unverified` means
 * the check was skipped or timed out (falls back to the async geocode job).
 */
export const geocodeVerificationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('found'), lat: z.number(), lng: z.number() }),
  z.object({ status: z.literal('not_found'), lat: z.null(), lng: z.null() }),
  z.object({ status: z.literal('unverified'), lat: z.null(), lng: z.null() }),
]);
export type GeocodeVerification = z.infer<typeof geocodeVerificationSchema>;

/**
 * How the row's property will be handled at commit. `resolution: 'existing'`
 * means a perfect normalized-address match was found (`propertyId`/`propertyCode`
 * set); `'new'` means one will be created. `duplicateOfRow` marks intra-batch
 * dedupe — the first row number in this import that introduced the same new
 * address (null for the first occurrence, or when resolution is 'existing').
 * `geocode` is only ever set on `'new'` rows.
 */
export const importPropertyPlanSchema = z.object({
  resolution: z.enum(['existing', 'new']),
  propertyId: z.string().uuid().nullable(),
  propertyCode: z.string().nullable(),
  street: z.string(),
  addressLine2: z.string().nullable(),
  suburb: z.string(),
  state: z.string(),
  postcode: z.string(),
  country: z.string(),
  duplicateOfRow: z.number().int().positive().nullable(),
  geocode: geocodeVerificationSchema.nullable().default(null),
});
export type ImportPropertyPlan = z.infer<typeof importPropertyPlanSchema>;

export const importSummarySchema = z.object({
  totalRows: z.number().int().nonnegative(),
  importable: z.number().int().nonnegative(),
  withWarnings: z.number().int().nonnegative(),
  withErrors: z.number().int().nonnegative(),
});
export type ImportSummary = z.infer<typeof importSummarySchema>;
