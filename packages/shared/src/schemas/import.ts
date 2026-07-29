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
  /** Free-text unit identifier; when set on a 'new' plan the property is
   * created as APARTMENT. Defaulted so pre-existing previewJson payloads
   * (persisted before the field existed) still parse. */
  apartmentNumber: z.string().nullable().default(null),
  suburb: z.string(),
  state: z.string(),
  postcode: z.string(),
  country: z.string(),
  duplicateOfRow: z.number().int().positive().nullable(),
  geocode: geocodeVerificationSchema.nullable().default(null),
});
export type ImportPropertyPlan = z.infer<typeof importPropertyPlanSchema>;

/**
 * Stable identifiers for problems with the FILE itself, as opposed to a row.
 * Doubles as the `error.code` on the 4xx envelope for the blocking cases, so a
 * consumer branches on one enum whether the issue arrived as a thrown error or
 * as a warning riding on a successful preview.
 *
 * Every blocking case MUST map to a 4xx: `getErrorMessage` (utils/api-error)
 * replaces the message of anything >= 500 with a generic string, so a 500 can
 * never tell the user what is wrong with their file.
 */
export const IMPORT_FILE_ISSUE_CODES = [
  // Blocking — thrown, HTTP 400.
  'IMPORT_FILE_EMPTY',
  'IMPORT_FILE_CONTENT_MISMATCH',
  'IMPORT_FILE_CORRUPT_XLSX',
  'IMPORT_FILE_CORRUPT_CSV',
  'IMPORT_FILE_NO_WORKSHEETS',
  'IMPORT_FILE_NO_HEADER_ROW',
  'IMPORT_FILE_MISSING_COLUMNS',
  // Non-blocking — collected and returned on the 200 preview response.
  'IMPORT_FILE_MULTIPLE_SHEETS',
  'IMPORT_FILE_UNKNOWN_COLUMNS',
  'IMPORT_FILE_NO_DATA_ROWS',
] as const;
export type ImportFileIssueCode = (typeof IMPORT_FILE_ISSUE_CODES)[number];

/** An ignored spreadsheet column, with the closest recognized header when the
 * two are near enough to be a typo (`null` when nothing is close). */
export const importFileUnknownColumnSchema = z.object({
  column: z.string(),
  suggestion: z.string().nullable(),
});
export type ImportFileUnknownColumn = z.infer<typeof importFileUnknownColumnSchema>;

/**
 * A problem with the file as a whole. Deliberately a FLAT object with a
 * `.default()` on every payload field rather than a discriminated union:
 *
 * 1. the Fastify zod serializer `safeParse`s the response and throws a 500 on
 *    a missing required key — and it does so AFTER the storage upload and the
 *    DB save have committed. Defaults make that unreachable.
 * 2. `previewJson` blobs persisted before this field existed must still parse
 *    (same precedent as `importPropertyPlanSchema.apartmentNumber` above).
 * 3. a union serializes badly through `jsonSchemaTransform` into openapi.json.
 *
 * `message` is built on the backend and rendered verbatim — one producer for
 * the HTTP envelope, the preview payload and the persisted commit failure.
 */
export const importFileIssueSchema = z.object({
  code: z.enum(IMPORT_FILE_ISSUE_CODES),
  severity: z.enum(['warning', 'error']),
  message: z.string(),
  missingColumns: z.array(z.string()).default([]),
  foundColumns: z.array(z.string()).default([]),
  unknownColumns: z.array(importFileUnknownColumnSchema).default([]),
  sheetUsed: z.string().nullable().default(null),
  sheetsIgnored: z.array(z.string()).default([]),
});
export type ImportFileIssue = z.infer<typeof importFileIssueSchema>;

export const importSummarySchema = z.object({
  totalRows: z.number().int().nonnegative(),
  importable: z.number().int().nonnegative(),
  withWarnings: z.number().int().nonnegative(),
  withErrors: z.number().int().nonnegative(),
});
export type ImportSummary = z.infer<typeof importSummarySchema>;
