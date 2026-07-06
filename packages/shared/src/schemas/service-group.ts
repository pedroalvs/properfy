import { z } from 'zod';
import { paginationSchema } from './pagination';

const timeWindowRegex = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

/**
 * Schema for creating a service group.
 *
 * A group must contain at least one appointment. There is no upper bound on the
 * number of appointments at creation time.
 */
export const createServiceGroupSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1),
  serviceTypeId: z.string().uuid(),
  // Temporal validation is TZ-aware and performed in the use case.
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeWindow: z.string().regex(timeWindowRegex),
  serviceRegionId: z.string().uuid().nullable().optional(),
  description: z.string().max(5000).optional(),
  actorTimezone: z.string().optional(),
});
export type CreateServiceGroupInput = z.infer<typeof createServiceGroupSchema>;

export const updateServiceGroupSchema = z.object({
  serviceRegionId: z.string().uuid().nullable().optional(),
  description: z.string().max(5000).optional(),
  // Draft-only fields; temporal validation is TZ-aware and performed in the use case.
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeWindow: z.string().regex(timeWindowRegex).optional(),
  actorTimezone: z.string().optional(),
});
export type UpdateServiceGroupInput = z.infer<typeof updateServiceGroupSchema>;

export const publishServiceGroupSchema = z.object({});
export type PublishServiceGroupInput = z.infer<typeof publishServiceGroupSchema>;

export const assignInspectorSchema = z.object({
  inspectorId: z.string().uuid(),
});
export type AssignInspectorInput = z.infer<typeof assignInspectorSchema>;

export const cancelServiceGroupSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type CancelServiceGroupInput = z.infer<typeof cancelServiceGroupSchema>;

export const rejectServiceGroupSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type RejectServiceGroupInput = z.infer<typeof rejectServiceGroupSchema>;

export const republishServiceGroupSchema = z.object({
  reason: z.string().min(1).max(1000).optional(),
});
export type RepublishServiceGroupInput = z.infer<typeof republishServiceGroupSchema>;

export const acceptOfferSchema = z.object({});
export type AcceptOfferInput = z.infer<typeof acceptOfferSchema>;

export const listServiceGroupsQuerySchema = paginationSchema.extend({
  tenantId: z.string().uuid().optional(),
  status: z.preprocess(
    (v) => {
      if (v === undefined || v === null || v === '') return undefined;
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
      return [v];
    },
    z.array(z.enum(['DRAFT', 'PUBLISHED', 'ACCEPTED', 'CANCELLED', 'REJECTED'])).min(1).optional(),
  ),
  serviceTypeId: z.string().uuid().optional(),
  scheduledDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduledDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Map view requires appointments + property coordinates per group.
  includeAppointments: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === true || v === 'true'),
  search: z.string().max(200).optional(),
  branchId: z.string().uuid().optional(),
  contactSearch: z.string().max(200).optional(),
});
export type ListServiceGroupsQuery = z.infer<typeof listServiceGroupsQuerySchema>;

export const listMarketplaceOffersQuerySchema = paginationSchema.extend({});
export type ListMarketplaceOffersQuery = z.infer<typeof listMarketplaceOffersQuerySchema>;

// ─── Add appointments to group (026 §FR-503..520) ────────────────────────
//
// Reuses `ServiceGroupValidator` server-side; the same request shape feeds
// both the add endpoint and the read-only eligibility-check preview.
// Capacity cap of 30 matches the existing service-group invariant
// (spec 005 line 244).

export const addAppointmentsToGroupRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(30),
});
export type AddAppointmentsToGroupRequest = z.infer<typeof addAppointmentsToGroupRequestSchema>;

export const eligibilityCheckRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(30),
});
export type EligibilityCheckRequest = z.infer<typeof eligibilityCheckRequestSchema>;

/**
 * The eligibility preview is a snapshot, not a commitment — the actual
 * add call re-validates each appointment because group state may have
 * changed between preview and add. `reasonCode` strings follow the
 * `ServiceGroupValidator` set: INVALID_STATUS / INVALID_TENANT /
 * INVALID_SERVICE_TYPE / ALREADY_GROUPED /
 * GROUP_CAPACITY_EXCEEDED / GROUP_IN_TERMINAL_STATE. Date and time
 * window are not validated — appointments are re-scheduled to the
 * group's date/window on join.
 */
export const eligibilityCheckResponseSchema = z.object({
  eligibleAppointmentIds: z.array(z.string().uuid()),
  ineligibleAppointmentIds: z.array(z.object({
    id: z.string().uuid(),
    reasonCode: z.string(),
  })),
  groupAccepts: z.boolean(),
  groupReasons: z.array(z.string()),
});
export type EligibilityCheckResponse = z.infer<typeof eligibilityCheckResponseSchema>;

// ─── 026 B1 — Find addable groups for appointments ──────────────────────────

export const findAddableGroupsRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(30),
});
export type FindAddableGroupsRequest = z.infer<typeof findAddableGroupsRequestSchema>;

export const addableGroupSummarySchema = z.object({
  id: z.string().uuid(),
  // DB-assigned for every group; the single producer (find-addable-groups) maps both.
  groupNumber: z.number(),
  code: z.string(),
  status: z.string(),
  scheduledDate: z.string(),
  timeWindow: z.string(),
  currentSize: z.number().int(),
  serviceTypeName: z.string().nullable(),
});
export type AddableGroupSummary = z.infer<typeof addableGroupSummarySchema>;

export const findAddableGroupsResponseSchema = z.object({
  groups: z.array(addableGroupSummarySchema),
  /** Set when the selected appointments have mixed properties or invalid statuses. Groups will be empty. */
  reason: z.enum(['MIXED_APPOINTMENT_PROPERTIES', 'INVALID_APPOINTMENT_STATUS']).optional(),
});
export type FindAddableGroupsResponse = z.infer<typeof findAddableGroupsResponseSchema>;

// ─── Group "Send portal link" (preview + execute) ───────────────────────────
//
// The operator sends the tenant confirmation portal link to every appointment
// in a group at once. The planned action per appointment is computed by the
// shared `classifyPortalLinkAction` resolver and is the single source of truth
// behind both the preview (GET …/portal-link-plan) and the send
// (POST …/portal-links). The preview returns the plannedAction + summary so the
// confirm dialog can show what will happen; the send returns the richer
// dispatch-time outcome.

export const groupPortalLinkPlannedActionSchema = z.enum([
  'SEND', // sendable, not yet confirmed for the current date/time
  'SEND_AFTER_RESET', // confirmed but stale (date/time changed) → reset then resend
  'SKIP_ALREADY_CONFIRMED', // confirmed for the current date/time → skip
  'SKIP_NOT_SENDABLE', // status not in AWAITING_INSPECTOR/SCHEDULED → skip
]);
export type GroupPortalLinkPlannedAction = z.infer<typeof groupPortalLinkPlannedActionSchema>;

export const groupPortalLinkPlanItemSchema = z.object({
  appointmentId: z.string().uuid(),
  appointmentNumber: z.number().int(),
  propertyCode: z.string().nullable(),
  plannedAction: groupPortalLinkPlannedActionSchema,
});
export type GroupPortalLinkPlanItem = z.infer<typeof groupPortalLinkPlanItemSchema>;

export const getGroupPortalLinkPlanResponseSchema = z.object({
  items: z.array(groupPortalLinkPlanItemSchema),
  summary: z.object({
    total: z.number().int(),
    willSend: z.number().int(), // SEND
    willResendDateChanged: z.number().int(), // SEND_AFTER_RESET
    alreadyConfirmed: z.number().int(), // SKIP_ALREADY_CONFIRMED
    notSendable: z.number().int(), // SKIP_NOT_SENDABLE
  }),
});
export type GetGroupPortalLinkPlanResponse = z.infer<typeof getGroupPortalLinkPlanResponseSchema>;

export const sendGroupPortalLinksRequestSchema = z.object({
  /**
   * IANA timezone of the operator's browser, used to compute the per-day
   * idempotency bucket — same contract as bulkResendReminderRequestSchema.
   * Frontend sends `Intl.DateTimeFormat().resolvedOptions().timeZone`.
   */
  actorTimezone: z.string().optional(),
});
export type SendGroupPortalLinksRequest = z.infer<typeof sendGroupPortalLinksRequestSchema>;

/**
 * Per-item outcome of the send. Mirrors bulkResendReminderResultStatusSchema
 * and adds the skip outcomes plus the date-changed-resend outcome unique to
 * this flow:
 * - SENT / DATE_CHANGED_RESENT: link dispatched (the latter after resetting a
 *   stale confirmation for the new date).
 * - ALREADY_CONFIRMED / NOT_SENDABLE: skipped by the eligibility rule.
 * - NO_PRIMARY_CONTACT: token minted but no primary contact to dispatch to.
 * - IDEMPOTENT_REPLAY: already sent today (per-day bucket), no re-dispatch.
 * - ERROR: per-item failure surfaced without aborting the batch.
 */
export const sendGroupPortalLinksResultStatusSchema = z.enum([
  'SENT',
  'DATE_CHANGED_RESENT',
  'ALREADY_CONFIRMED',
  'NOT_SENDABLE',
  'NO_PRIMARY_CONTACT',
  'IDEMPOTENT_REPLAY',
  'ERROR',
]);
export type SendGroupPortalLinksResultStatus = z.infer<typeof sendGroupPortalLinksResultStatusSchema>;

export const sendGroupPortalLinksResultItemSchema = z.object({
  appointmentId: z.string().uuid(),
  status: sendGroupPortalLinksResultStatusSchema,
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type SendGroupPortalLinksResultItem = z.infer<typeof sendGroupPortalLinksResultItemSchema>;

export const sendGroupPortalLinksResponseSchema = z.object({
  results: z.array(sendGroupPortalLinksResultItemSchema),
});
export type SendGroupPortalLinksResponse = z.infer<typeof sendGroupPortalLinksResponseSchema>;
