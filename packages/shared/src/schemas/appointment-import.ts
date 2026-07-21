import { z } from 'zod';
import { additionalChannelSchema } from './contact';
import { customFieldSchema, CUSTOM_FIELDS_MAX, HHMM_REGEX } from './appointment';
import { importPropertyPlanSchema, importRowIssueSchema, importSummarySchema, IMPORT_ROW_SEVERITY } from './import';

/**
 * Single source of truth for the appointment-import preview/commit contract.
 * The generic building blocks (row severity, issues, property plan, summary)
 * live in `./import` and are shared with the property importer; they are
 * re-exported here so existing imports keep working. Produced by the row
 * resolver (application/services/appointment-import-row-resolver.ts) and
 * consumed unchanged by both the preview endpoint and the `previewJson`
 * field on the status endpoint.
 */

export {
  IMPORT_ROW_SEVERITY,
  importRowIssueSchema,
  importPropertyPlanSchema,
  importSummarySchema,
  geocodeVerificationSchema,
} from './import';
export type {
  ImportRowSeverity,
  ImportRowIssue,
  ImportPropertyPlan,
  ImportSummary,
  GeocodeVerification,
} from './import';

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
