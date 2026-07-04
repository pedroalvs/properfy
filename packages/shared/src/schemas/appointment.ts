import { z } from 'zod';
import { paginationSchema } from './pagination';
import { contactSchema, appointmentContactsArraySchema } from './contact';
import { restrictionSchema } from './restriction';
import { AppointmentStatus, RentalTenantConfirmationStatus } from '../enums/appointment';
import { CancellationReasonCode, RejectionReasonCode } from '../enums/reason-codes';

// Inline property for creation (matches createPropertySchema subset)
const inlinePropertySchema = z.object({
  propertyCode: z.string().min(1).max(50).trim(),
  type: z.enum(['APARTMENT', 'HOUSE', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL']),
  street: z.string().min(1).max(300).trim(),
  addressLine2: z.string().max(200).trim().optional(),
  suburb: z.string().min(1).max(100).trim(),
  postcode: z.string().min(1).max(20).trim(),
  state: z.string().min(1).max(100).trim(),
  country: z.string().min(2).max(100).trim().default('AU'),
  notes: z.string().max(2000).optional(),
});

/** Strict 24h HH:mm — rejects impossible clock values like 24:00 or 12:60. */
export const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeRegex = HHMM_REGEX;
const TIME_FORMAT_MESSAGE = 'Must be HH:mm format';
const TIME_RANGE_MESSAGE = 'End time must be after start time';

/**
 * Appointment scheduling time is stored as two independent `HH:mm` fields
 * (`timeSlotStart` / `timeSlotEnd`). Because the values are zero-padded,
 * lexicographic comparison equals chronological comparison.
 */
const isTimeRangeOrdered = (start?: string, end?: string): boolean =>
  start === undefined || end === undefined || start < end;

/**
 * Operational free-text observation set on direct create/edit (distinct from
 * tenant-portal `notes`/`rentalTenantNote`). Empty/whitespace-only input is normalized
 * to "no value" at the contract boundary — a single source of truth so the
 * dedicated `appointment.observation_updated` audit stays honest regardless of
 * which client writes (web, PWA, direct API), instead of relying on each client
 * to trim. On create absent/blank collapses to `undefined`; on update to `null`
 * (explicit clear), while a truly absent key stays `undefined` (no-op).
 */
const observationCreateField = z
  .string()
  .max(2000)
  .optional()
  .transform((v) => (v == null || v.trim() === '' ? undefined : v));

const observationUpdateField = z
  .string()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (v == null ? v : v.trim() === '' ? null : v));

/** Single source of truth for custom-field limits (shared by schema, backend
 *  normalization and the web form's maxLength props). */
export const CUSTOM_FIELD_LABEL_MAX = 50;
export const CUSTOM_FIELD_VALUE_MAX = 500;
export const CUSTOM_FIELDS_MAX = 4;

/**
 * Repeatable operator-defined custom field on an appointment. Each entry is a
 * required `{ label, value }` pair; a maximum of {@link CUSTOM_FIELDS_MAX} are
 * allowed per appointment. Stored opaquely in `appointments.custom_fields_json`.
 * Input is validated strictly; response schemas stay permissive (see
 * responses.ts) to avoid the fastify serializer throwing on legacy/edge data.
 */
export const customFieldSchema = z.object({
  label: z.string().trim().min(1).max(CUSTOM_FIELD_LABEL_MAX),
  value: z.string().trim().min(1).max(CUSTOM_FIELD_VALUE_MAX),
});
export const appointmentCustomFieldsSchema = z.array(customFieldSchema).max(CUSTOM_FIELDS_MAX);
export type AppointmentCustomField = z.infer<typeof customFieldSchema>;

/**
 * Normalize an opaque `custom_fields_json` value (possibly legacy/malformed) into
 * a clean, contract-valid `{ label, value }[]`, capped at {@link CUSTOM_FIELDS_MAX}.
 * Non-array inputs and rows that fail {@link customFieldSchema} (missing/blank/oversized
 * label or value) are dropped. Shared by the inspector detail response mapping and
 * the web appointment-detail hook so the read-side transformation stays consistent.
 */
export function normalizeCustomFields(raw: unknown): AppointmentCustomField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => customFieldSchema.safeParse(row))
    .filter((result): result is { success: true; data: AppointmentCustomField } => result.success)
    .map((result) => result.data)
    .slice(0, CUSTOM_FIELDS_MAX);
}

export const createAppointmentSchema = z.object({
  branchId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  property: inlinePropertySchema.optional(),
  serviceTypeId: z.string().uuid(),
  // Temporal validation (past-date / past-time) is TZ-aware and performed in the use case.
  scheduledDate: z.string().date(),
  timeSlotStart: z.string().regex(timeRegex, TIME_FORMAT_MESSAGE),
  timeSlotEnd: z.string().regex(timeRegex, TIME_FORMAT_MESSAGE),
  /** @deprecated Use `contacts` array instead. Kept for backward compat during transition. */
  contact: contactSchema.optional(),
  /** New contacts array (feature 021). Each entry is { contactId } or { inline } with role + isPrimary. */
  contacts: appointmentContactsArraySchema.optional(),
  /** App credentials linked to this appointment (live reference, many-to-many). */
  appCredentialIds: z.array(z.string().uuid()).max(50).optional(),
  restriction: restrictionSchema.optional(),
  keyRequired: z.boolean().default(false),
  meetingLocation: z.string().max(500).optional(),
  keyLocation: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  observation: observationCreateField,
  customFields: appointmentCustomFieldsSchema.optional(),
  actorTimezone: z.string().optional(),
}).refine(
  (data) => !!data.propertyId !== !!data.property,
  { message: 'Must provide either propertyId or property (inline), but not both', path: ['propertyId'] },
).refine(
  (data) => {
    const hasLegacy = data.contact !== undefined;
    const hasNew = data.contacts !== undefined;
    return (hasLegacy || hasNew) && !(hasLegacy && hasNew);
  },
  { message: 'Must provide either contact (legacy) or contacts (array), but not both and not neither', path: ['contacts'] },
).refine(
  (data) => isTimeRangeOrdered(data.timeSlotStart, data.timeSlotEnd),
  { message: TIME_RANGE_MESSAGE, path: ['timeSlotEnd'] },
);
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  // Temporal validation (past-date / past-time) is TZ-aware and performed in the use case.
  scheduledDate: z.string().date().optional(),
  timeSlotStart: z.string().regex(timeRegex, TIME_FORMAT_MESSAGE).optional(),
  timeSlotEnd: z.string().regex(timeRegex, TIME_FORMAT_MESSAGE).optional(),
  keyRequired: z.boolean().optional(),
  meetingLocation: z.string().max(500).nullable().optional(),
  keyLocation: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  observation: observationUpdateField,
  /** @deprecated Use `contacts` array instead. */
  contact: contactSchema.optional(),
  /** New contacts array (feature 021). When present, replaces all junction rows. */
  contacts: appointmentContactsArraySchema.optional(),
  /** App credentials linked to this appointment. When present, replaces all links (empty array clears). */
  appCredentialIds: z.array(z.string().uuid()).max(50).optional(),
  restriction: restrictionSchema.optional(),
  customFields: appointmentCustomFieldsSchema.nullable().optional(),
  actorTimezone: z.string().optional(),
}).refine(
  (data) => {
    const hasLegacy = data.contact !== undefined;
    const hasNew = data.contacts !== undefined;
    // Both absent is fine (no contact change). Both present is not.
    return !(hasLegacy && hasNew);
  },
  { message: 'Cannot provide both contact and contacts in the same update', path: ['contacts'] },
).refine(
  // The time window is a pair — reject a partial update of only one side.
  (data) => (data.timeSlotStart === undefined) === (data.timeSlotEnd === undefined),
  { message: 'Both timeSlotStart and timeSlotEnd are required together', path: ['timeSlotEnd'] },
).refine(
  (data) => isTimeRangeOrdered(data.timeSlotStart, data.timeSlotEnd),
  { message: TIME_RANGE_MESSAGE, path: ['timeSlotEnd'] },
);
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export const statusTransitionSchema = z.object({
  targetStatus: z.nativeEnum(AppointmentStatus),
  reason: z.string().max(1000).optional(),
  cancellationReasonCode: z.nativeEnum(CancellationReasonCode).optional(),
  rejectionReasonCode: z.nativeEnum(RejectionReasonCode).optional(),
  doneCheckedByUserId: z.string().uuid().optional(),
  crossCheckByUserId: z.string().uuid().optional(),
  inspectorId: z.string().uuid().optional(),
});
export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;

export const listAppointmentsQuerySchema = paginationSchema.extend({
  status: z.preprocess(
    (v) => {
      if (v === undefined || v === null || v === '') return undefined;
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
      return [v];
    },
    z.array(z.nativeEnum(AppointmentStatus)).min(1).optional(),
  ),
  serviceTypeId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  inspectorId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  rentalTenantConfirmationStatus: z.nativeEnum(RentalTenantConfirmationStatus).optional(),
  showCancelled: z
    .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
    .optional(),
  overdueOnly: z
    .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
    .optional(),
  ungroupedOnly: z
    .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
    .optional(),
  // Free time-range filter (replaces the former exact-match time-slot filter):
  // match appointments whose start time falls within [timeFrom, timeTo].
  timeFrom: z.string().regex(timeRegex, TIME_FORMAT_MESSAGE).optional(),
  timeTo: z.string().regex(timeRegex, TIME_FORMAT_MESSAGE).optional(),
  contactSearch: z.string().max(200).optional(),
  hasRentalTenantNote: z
    .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
    .optional(),
  confirmationStatus: z.enum(['sent', 'not_sent']).optional(),
  // Membership filter: return the appointments belonging to a single service
  // group (drives the map "Groups" drill-down modal). Unlike `ungroupedOnly`
  // (service_group_id IS NULL), this is a positive match on a specific group.
  serviceGroupId: z.string().uuid().optional(),
}).superRefine((val, ctx) => {
  // Reject inverted time ranges (timeFrom must not be after timeTo).
  if (val.timeFrom && val.timeTo && val.timeFrom > val.timeTo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['timeTo'],
      message: 'timeTo must be after or equal to timeFrom',
    });
  }
  // `serviceGroupId` (positive membership) and `ungroupedOnly`
  // (service_group_id IS NULL) are mutually exclusive — fail fast rather than
  // silently dropping `serviceGroupId` downstream in the repository.
  if (val.serviceGroupId && val.ungroupedOnly) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceGroupId'],
      message: 'serviceGroupId cannot be combined with ungroupedOnly',
    });
  }
});
export type ListAppointmentsQueryInput = z.infer<typeof listAppointmentsQuerySchema>;

// --- Bulk edit (FR-066..FR-069a) ---

const bulkEditChangesSchema = z.object({
  assignedInspectorId: z.string().uuid().optional(),
  scheduledDate: z.string().date().optional(),
  // The "Time Slot" bulk change emits both ends together (or neither).
  timeSlotStart: z.string().regex(timeRegex, TIME_FORMAT_MESSAGE).optional(),
  timeSlotEnd: z.string().regex(timeRegex, TIME_FORMAT_MESSAGE).optional(),
  branchId: z.string().uuid().optional(),
  serviceTypeId: z.string().uuid().optional(),
  propertyManagerContactId: z.string().uuid().optional(),
}).strict() // .strict() rejects unknown keys → APPOINTMENT_BULK_FIELD_NOT_ALLOWED
  .refine(
    (data) => (data.timeSlotStart === undefined) === (data.timeSlotEnd === undefined),
    { message: 'Both timeSlotStart and timeSlotEnd are required together', path: ['timeSlotEnd'] },
  )
  .refine(
    (data) => isTimeRangeOrdered(data.timeSlotStart, data.timeSlotEnd),
    { message: TIME_RANGE_MESSAGE, path: ['timeSlotEnd'] },
  );

/** Per-field policies the use case applies. Currently only governs the
 *  Property-Manager contact change: `replace` (default — overwrite the existing
 *  PM junction row) or `addIfMissing` (skip appointments that already have a
 *  PM contact and surface them in `failed[]`). */
const bulkEditOptionsSchema = z.object({
  propertyManagerContactPolicy: z.enum(['replace', 'addIfMissing']).optional(),
}).optional();

export const bulkEditAppointmentSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one appointment id is required').max(100, 'Maximum 100 appointments per bulk edit'),
  changes: bulkEditChangesSchema.refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'At least one field must be provided in changes' },
  ),
  options: bulkEditOptionsSchema,
  actorTimezone: z.string().optional(),
});
export type BulkEditAppointmentInput = z.infer<typeof bulkEditAppointmentSchema>;

export const forceManualConfirmationSchema = z.object({
  rentalTenantConfirmationStatus: z.literal('CONFIRMED'),
  reason: z.string().min(1).max(1000),
});
export type ForceManualConfirmationInput = z.infer<typeof forceManualConfirmationSchema>;

// ─── Bulk re-send tenant-portal reminder (023 §FR-241..245) ──────────────

/**
 * Status enum for each per-appointment item in the bulk re-send response.
 * - SENT: portal token generated and notification dispatched.
 * - NO_PRIMARY_CONTACT: appointment has no primary contact; nothing dispatched.
 * - IDEMPOTENT_REPLAY: a prior request for the same `(appointmentId, dayInActorTz)`
 *   already produced a result; cached result returned, no new dispatch.
 * - ERROR: per-item failure surfaced without aborting the batch.
 */
export const bulkResendReminderResultStatusSchema = z.enum([
  'SENT',
  'NO_PRIMARY_CONTACT',
  'IDEMPOTENT_REPLAY',
  'ERROR',
]);
export type BulkResendReminderResultStatus = z.infer<typeof bulkResendReminderResultStatusSchema>;

export const bulkResendReminderResultSchema = z.object({
  appointmentId: z.string().uuid(),
  status: bulkResendReminderResultStatusSchema,
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type BulkResendReminderResult = z.infer<typeof bulkResendReminderResultSchema>;

export const bulkResendReminderRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(100),
  /**
   * 023 §FR-243 — IANA timezone of the operator's browser, used to compute
   * the per-day idempotency key (`dayInActorTz`). When omitted the server
   * falls back to its own TZ — leaving operators across regions exposed
   * to off-by-one bucket boundaries. Frontend sends the value of
   * `Intl.DateTimeFormat().resolvedOptions().timeZone`.
   */
  actorTimezone: z.string().optional(),
});
export type BulkResendReminderRequest = z.infer<typeof bulkResendReminderRequestSchema>;

export const bulkResendReminderResponseSchema = z.object({
  results: z.array(bulkResendReminderResultSchema),
});
export type BulkResendReminderResponse = z.infer<typeof bulkResendReminderResponseSchema>;

// ─── Bulk map-flow actions (025 §FR-401..460) ────────────────────────────
//
// Four bulk endpoints (cancel / reschedule / status-transition / assign-inspector)
// share the same per-item result envelope. Each item carries an OK status or
// one of the typed failure modes — the batch never aborts on a per-item error.
// Idempotency key prefix: `bulk_<action>:<appointmentId>:<dayInActorTz>`.

export const bulkActionResultStatusSchema = z.enum([
  'OK',
  'INVALID_TRANSITION',
  'FORBIDDEN',
  'NOT_FOUND',
  'ERROR',
  'IDEMPOTENT_REPLAY',
]);
export type BulkActionResultStatus = z.infer<typeof bulkActionResultStatusSchema>;

export const bulkActionResultItemSchema = z.object({
  appointmentId: z.string().uuid(),
  status: bulkActionResultStatusSchema,
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type BulkActionResultItem = z.infer<typeof bulkActionResultItemSchema>;

export const bulkActionResponseSchema = z.object({
  results: z.array(bulkActionResultItemSchema),
});
export type BulkActionResponse = z.infer<typeof bulkActionResponseSchema>;

/**
 * 025 §FR-411 — Bulk cancel up to 100 appointments. Reason is required
 * (cancellation always demands one per CLAUDE.md §5 state machine).
 */
export const bulkCancelRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().min(3).max(500),
  /** IANA timezone for per-day idempotency bucketing (see bulk_resend_reminder). */
  actorTimezone: z.string().optional(),
});
export type BulkCancelRequest = z.infer<typeof bulkCancelRequestSchema>;

/**
 * 025 §FR-421 — Bulk reschedule. `newDate` accepts ISO datetime or date-only
 * (kept consistent with `createAppointmentSchema.scheduledDate`). The new time
 * window is optional — when omitted each appointment keeps its existing times.
 */
export const bulkRescheduleRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(100),
  newDate: z.union([z.string().datetime(), z.string().date()]),
  newTimeSlotStart: z.string().regex(timeRegex, TIME_FORMAT_MESSAGE).optional(),
  newTimeSlotEnd: z.string().regex(timeRegex, TIME_FORMAT_MESSAGE).optional(),
  actorTimezone: z.string().optional(),
}).refine(
  (data) => (data.newTimeSlotStart === undefined) === (data.newTimeSlotEnd === undefined),
  { message: 'Both newTimeSlotStart and newTimeSlotEnd are required together', path: ['newTimeSlotEnd'] },
).refine(
  (data) => isTimeRangeOrdered(data.newTimeSlotStart, data.newTimeSlotEnd),
  { message: TIME_RANGE_MESSAGE, path: ['newTimeSlotEnd'] },
);
export type BulkRescheduleRequest = z.infer<typeof bulkRescheduleRequestSchema>;

/**
 * 025 §FR-431 — Bulk status transition. Reason is optional at the schema
 * level; the state machine enforces it per-transition via `isReasonRequired`
 * (see `packages/shared/src/lib/appointment-transitions.ts`).
 */
export const bulkStatusTransitionRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(100),
  targetStatus: z.nativeEnum(AppointmentStatus),
  reason: z.string().min(3).max(500).optional(),
  actorTimezone: z.string().optional(),
});
export type BulkStatusTransitionRequest = z.infer<typeof bulkStatusTransitionRequestSchema>;

/**
 * 025 §FR-441 — Bulk assign / reassign inspector. Use case validates the
 * inspector is active per tenant rules; per-item FORBIDDEN if not.
 */
export const bulkAssignInspectorRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(100),
  inspectorId: z.string().uuid(),
  actorTimezone: z.string().optional(),
});
export type BulkAssignInspectorRequest = z.infer<typeof bulkAssignInspectorRequestSchema>;

/**
 * 026 §FR-540..545 — Bulk re-open for reschedule.
 *
 * Delegates per-item to the existing single-item `ReopenForRescheduleUseCase`
 * (spec 006 GAP-003), which already enforces the 30-day window and emits the
 * `appointment.rescheduled` audit. 026 extends that use case additively to
 * revoke active portal tokens after the reschedule.
 *
 * The new time window is REQUIRED here (unlike `bulkRescheduleRequestSchema`
 * from 025) because the reschedule form forces the operator to pick an explicit
 * start/end time per Regras matrix.
 *
 * `appointmentIds.max(30)` mirrors the group-capacity cap because bulk
 * reschedule is intentionally same-group-only in this cycle (cross-group
 * bulk is GAP-501 future work).
 */
export const bulkReopenForRescheduleRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(30),
  newDate: z.union([z.string().datetime(), z.string().date()]),
  newTimeSlotStart: z.string().regex(timeRegex, TIME_FORMAT_MESSAGE),
  newTimeSlotEnd: z.string().regex(timeRegex, TIME_FORMAT_MESSAGE),
  reason: z.string().min(3).max(500).optional(),
  actorTimezone: z.string().optional(),
}).refine(
  (data) => data.newTimeSlotStart < data.newTimeSlotEnd,
  { message: TIME_RANGE_MESSAGE, path: ['newTimeSlotEnd'] },
);
export type BulkReopenForRescheduleRequest = z.infer<typeof bulkReopenForRescheduleRequestSchema>;

