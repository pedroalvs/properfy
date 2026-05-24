import { z } from 'zod';
import { paginationSchema } from './pagination';

const timeWindowRegex = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

const exceptionTypeEnum = z.enum(['LOW_DENSITY_REGION', 'ISOLATED_SERVICE', 'PRIORITY_CLIENT']);

/**
 * Schema for creating a service group.
 *
 * Size limits:
 *   - Standard (no exception): min 5, max 30
 *   - LOW_DENSITY_REGION: min 1, max 30
 *   - ISOLATED_SERVICE: min 1, max 3
 *   - PRIORITY_CLIENT: min 1, max 8
 *
 * The shared schema enforces the hard boundary (min 1, max 30).
 * Business-rule limits per exception type are enforced by the domain validator.
 * See: projeto-consolidado/service-group-exceptions.md
 */
export const createServiceGroupSchema = z
  .object({
    appointmentIds: z.array(z.string().uuid()).min(1).max(30),
    serviceTypeId: z.string().uuid(),
    // Temporal validation is TZ-aware and performed in the use case.
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeWindow: z.string().regex(timeWindowRegex),
    name: z.string().min(1).max(255).optional(),
    serviceRegionId: z.string().uuid().nullable().optional(),
    description: z.string().max(5000).optional(),
    priorityMode: z.enum(['STANDARD', 'PRIORITY_24H']).default('STANDARD'),
    exceptionType: exceptionTypeEnum.optional(),
    exceptionReason: z.string().min(10).max(1000).optional(),
    actorTimezone: z.string().optional(),
  })
  .refine(
    (data) => {
      const hasType = data.exceptionType !== undefined;
      const hasReason = data.exceptionReason !== undefined;
      return hasType === hasReason;
    },
    { message: 'exceptionType and exceptionReason must both be provided or both omitted' },
  );
export type CreateServiceGroupInput = z.infer<typeof createServiceGroupSchema>;

export const updateServiceGroupSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    serviceRegionId: z.string().uuid().nullable().optional(),
    description: z.string().max(5000).optional(),
    // Draft-only fields; temporal validation is TZ-aware and performed in the use case.
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    timeWindow: z.string().regex(timeWindowRegex).optional(),
    priorityMode: z.enum(['STANDARD', 'PRIORITY_24H']).optional(),
    exceptionType: exceptionTypeEnum.nullable().optional(),
    exceptionReason: z.string().min(10).max(1000).nullable().optional(),
    actorTimezone: z.string().optional(),
  })
  .refine(
    (data) => {
      // If either exceptionType or exceptionReason is explicitly set (not undefined),
      // both must be provided together or both set to null
      const typeProvided = data.exceptionType !== undefined;
      const reasonProvided = data.exceptionReason !== undefined;
      if (!typeProvided && !reasonProvided) return true;
      if (typeProvided && reasonProvided) {
        const typeNull = data.exceptionType === null;
        const reasonNull = data.exceptionReason === null;
        return typeNull === reasonNull;
      }
      return false;
    },
    { message: 'exceptionType and exceptionReason must both be provided or both omitted' },
  );
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
  priorityMode: z.enum(['STANDARD', 'PRIORITY_24H']).optional(),
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
 * INVALID_SERVICE_TYPE / INVALID_DATE / INVALID_TIME_WINDOW /
 * ALREADY_GROUPED / GROUP_CAPACITY_EXCEEDED / GROUP_IN_TERMINAL_STATE.
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
  name: z.string().nullable(),
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
