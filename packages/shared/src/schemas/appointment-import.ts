import { z } from 'zod';
import { additionalChannelSchema } from './contact';
import { customFieldSchema, CUSTOM_FIELDS_MAX, HHMM_REGEX } from './appointment';

/**
 * Single source of truth for the appointment-import preview/commit contract.
 * Both the backend route `response` schemas (preview + status) and the web
 * preview UI infer their types from these — see
 * `project_fastify_response_schema_serializer_throws` (a hand-written type
 * that drifts from the actual payload throws a 500 in the serializer, not a
 * type error). Produced by the row resolver (application/services/
 * appointment-import-row-resolver.ts) and consumed unchanged by both the
 * preview endpoint and the `previewJson` field on the status endpoint.
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
 * How the row's property will be handled at commit. `resolution: 'existing'`
 * means a perfect normalized-address match was found (`propertyId`/`propertyCode`
 * set); `'new'` means one will be created. `duplicateOfRow` marks intra-batch
 * dedupe — the first row number in this import that introduced the same new
 * address (null for the first occurrence, or when resolution is 'existing').
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
});
export type ImportPropertyPlan = z.infer<typeof importPropertyPlanSchema>;

/**
 * How the row's single contact will be handled at commit. `additionalChannels`
 * are only ever persisted when `resolution === 'new'` — `CreateAppointmentUseCase`
 * only applies inline `additionalChannels` on the new-contact branch. When
 * `resolution === 'existing'` and the sheet had extra channels to offer,
 * `channelsDropped` is true and the preview must surface that as a warning
 * (see role-matrix note + the plan's decision on contact matching).
 */
export const importContactPlanSchema = z.object({
  resolution: z.enum(['existing', 'new']),
  contactId: z.string().uuid().nullable(),
  displayName: z.string(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  additionalChannels: z.array(additionalChannelSchema),
  channelsDropped: z.boolean(),
});
export type ImportContactPlan = z.infer<typeof importContactPlanSchema>;

/** One resolved spreadsheet row: normalized fields, resolved property/contact
 * plans, resolved custom fields (already capped at {@link CUSTOM_FIELDS_MAX}),
 * and every issue found. `property`/`contact` are null only when the row is
 * too broken to plan (e.g. no street at all) — the row is then `importable: false`. */
export const resolvedImportRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  severity: z.enum(IMPORT_ROW_SEVERITY),
  importable: z.boolean(),
  serviceTypeName: z.string().nullable(),
  serviceTypeId: z.string().uuid().nullable(),
  scheduledDate: z.string().date(),
  scheduledDateDefaulted: z.boolean(),
  timeSlotStart: z.string().regex(HHMM_REGEX, 'Must be HH:mm format'),
  timeSlotEnd: z.string().regex(HHMM_REGEX, 'Must be HH:mm format'),
  timeDefaulted: z.boolean(),
  notes: z.string().nullable(),
  property: importPropertyPlanSchema.nullable(),
  contact: importContactPlanSchema.nullable(),
  customFields: z.array(customFieldSchema).max(CUSTOM_FIELDS_MAX),
  customFieldsTruncated: z.boolean(),
  issues: z.array(importRowIssueSchema),
});
export type ResolvedImportRow = z.infer<typeof resolvedImportRowSchema>;

export const importSummarySchema = z.object({
  totalRows: z.number().int().nonnegative(),
  importable: z.number().int().nonnegative(),
  withWarnings: z.number().int().nonnegative(),
  withErrors: z.number().int().nonnegative(),
});
export type ImportSummary = z.infer<typeof importSummarySchema>;

/** Response body of `POST /v1/appointments/import/preview`, and the value of
 * `previewJson` on the extended status response. */
export const appointmentImportPreviewResponseSchema = z.object({
  importId: z.string().uuid(),
  branchId: z.string().uuid(),
  tenantId: z.string().uuid(),
  summary: importSummarySchema,
  rows: z.array(resolvedImportRowSchema),
});
export type AppointmentImportPreviewResponse = z.infer<typeof appointmentImportPreviewResponseSchema>;
