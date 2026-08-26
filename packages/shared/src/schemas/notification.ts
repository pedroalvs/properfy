import { z } from 'zod';
import { booleanQueryParam } from './boolean-query';
import { paginationSchema } from './pagination';
import { AU_E164_REGEX } from '../constants/phone';

// Feature 018: shared classification and consent enums as Zod schemas
export const notificationClassSchema = z.enum(['TRANSACTIONAL', 'OPERATIONAL', 'MARKETING']);
export type NotificationClassInput = z.infer<typeof notificationClassSchema>;

export const consentChangeSourceSchema = z.enum(['operator_override', 're_opt_in']);
export type ConsentChangeSourceInput = z.infer<typeof consentChangeSourceSchema>;

export const listNotificationsQuerySchema = paginationSchema.extend({
  tenantId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  channel: z.enum(['EMAIL', 'SMS']).optional(),
  // Feature 018: include SKIPPED and SKIPPED_OPT_OUT in the filter so operators can query suppressed notifications
  status: z.enum(['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED', 'SKIPPED_OPT_OUT']).optional(),
  templateCode: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt', 'sentAt', 'status']).default('createdAt'),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const upsertNotificationTemplateSchema = z.object({
  /** Required for EMAIL (enforced in the use case); always null for SMS. */
  subject: z.string().min(1).max(255).optional(),
  /**
   * The body as typed in the editor. Despite the name this carries PLAIN TEXT on
   * the SMS channel — the use case routes it to body_text (leaving body_html
   * NULL) or to body_html depending on the channel. The name is kept for wire
   * compatibility with the generated OpenAPI client.
   *
   * `.min(1)` still admits "   ", so the use case additionally rejects a
   * whitespace-only body.
   */
  bodyHtml: z.string().min(1),
  isActive: z.boolean(),
  notificationClass: notificationClassSchema.optional(),
  tenantId: z.string().uuid().optional(),
});
export type UpsertNotificationTemplateInput = z.infer<typeof upsertNotificationTemplateSchema>;

export const listNotificationTemplatesQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  templateCode: z.string().optional(),
  channel: z.enum(['EMAIL', 'SMS']).optional(),
  includeDefaults: booleanQueryParam().default(true),
});
export type ListNotificationTemplatesQuery = z.infer<typeof listNotificationTemplatesQuerySchema>;

// Feature 018: operator consent management
export const listConsentsQuerySchema = z.object({
  recipient: z.string().min(1),
  tenantId: z.string().uuid().optional(),
  channel: z.enum(['EMAIL', 'SMS']).optional(),
});
export type ListConsentsQuery = z.infer<typeof listConsentsQuerySchema>;

export const overrideConsentSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type OverrideConsentInput = z.infer<typeof overrideConsentSchema>;

export const consentRecordResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  recipient: z.string(),
  channel: z.enum(['EMAIL', 'SMS']),
  notificationClass: notificationClassSchema,
  optedOut: z.boolean(),
  changedAt: z.string().datetime().nullable(),
  changeSource: consentChangeSourceSchema.nullable(),
  reason: z.string().nullable(),
  changedByUserId: z.string().uuid().nullable(),
});
export type ConsentRecordResponse = z.infer<typeof consentRecordResponseSchema>;

export const listConsentsResponseSchema = z.object({
  recipient: z.string(),
  entries: z.array(consentRecordResponseSchema),
  skippedCount: z.number().int().nonnegative(),
});
export type ListConsentsResponse = z.infer<typeof listConsentsResponseSchema>;

// ---------------------------------------------------------------------------
// Template preview schemas
// ---------------------------------------------------------------------------

export const templatePreviewRequestSchema = z.object({
  subject: z.string().optional(),
  bodyHtml: z.string().min(1),
  tenantId: z.string().uuid().optional(),
});
export type TemplatePreviewRequest = z.infer<typeof templatePreviewRequestSchema>;

export const templatePreviewResponseSchema = z.object({
  subjectRendered: z.string(),
  htmlRendered: z.string(),
  /**
   * Present when the body could not be rendered (e.g. a Handlebars syntax
   * error). Template syntax problems carry the parser message so the operator
   * can fix the template; internal failures carry a generic message only.
   */
  renderError: z.string().optional(),
});
export type TemplatePreviewResponse = z.infer<typeof templatePreviewResponseSchema>;

// ---------------------------------------------------------------------------
// Template test-send schemas
// ---------------------------------------------------------------------------

/**
 * The tenant scope of the template under test. AM/OP editing an agency
 * override pass that agency's id; omitted = platform default. CL_ADMIN is
 * always pinned to its own tenant regardless of this field.
 */
const testSendScopeFields = {
  tenantId: z.string().uuid().optional(),
};

export const testSendEmailRequestSchema = z.object({
  recipientEmail: z.string().email(),
  ...testSendScopeFields,
  /**
   * Unsaved editor draft. When present the test renders and sends this content
   * instead of the persisted row, so the operator tests exactly what is on
   * screen. Validated with the same save-time HTML rules as an upsert.
   */
  draftSubject: z.string().min(1).max(255).optional(),
  draftBodyHtml: z.string().min(1).optional(),
});
export type TestSendEmailRequest = z.infer<typeof testSendEmailRequestSchema>;

export const testSendSmsRequestSchema = z.object({
  recipientPhone: z.string().regex(AU_E164_REGEX, 'Phone must be in E.164 AU format (e.g. +61412345678)'),
  ...testSendScopeFields,
  /** Unsaved editor draft (plain text) — same semantics as draftBodyHtml. */
  draftBodyText: z.string().min(1).optional(),
});
export type TestSendSmsRequest = z.infer<typeof testSendSmsRequestSchema>;

/**
 * Route-level (OpenAPI) shape of the test-send body: the union of the EMAIL
 * and SMS variants with everything optional. The handler still applies the
 * strict per-channel schema above — this one exists so the generated spec
 * documents the full contract on the single route.
 */
export const testSendRequestSchema = z.object({
  recipientEmail: z.string().email().optional(),
  recipientPhone: z.string().regex(AU_E164_REGEX).optional(),
  ...testSendScopeFields,
  draftSubject: z.string().min(1).max(255).optional(),
  draftBodyHtml: z.string().min(1).optional(),
  draftBodyText: z.string().min(1).optional(),
});
export type TestSendRequest = z.infer<typeof testSendRequestSchema>;

export const testSendResponseSchema = z.object({
  messageId: z.string(),
  recipient: z.string(),
  sentAt: z.string().datetime(),
});
export type TestSendResponse = z.infer<typeof testSendResponseSchema>;

// ---------------------------------------------------------------------------
// Template default (reset-to-default) schemas
// ---------------------------------------------------------------------------

export const templateDefaultQuerySchema = z.object({
  /**
   * Present when resetting an agency override — the answer is then the platform
   * default row. Omit it to reset the platform default itself, which returns the
   * factory catalog shipped in code.
   */
  tenantId: z.string().uuid().optional(),
});
export type TemplateDefaultQuery = z.infer<typeof templateDefaultQuerySchema>;

export const templateDefaultResponseSchema = z.object({
  subject: z.string().nullable(),
  /** Plain text on SMS, HTML on EMAIL — matches the editor's Body field. */
  body: z.string(),
  source: z.enum(['PLATFORM_DEFAULT', 'FACTORY']),
});
export type TemplateDefaultResponse = z.infer<typeof templateDefaultResponseSchema>;
