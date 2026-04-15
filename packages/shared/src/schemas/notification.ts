import { z } from 'zod';
import { paginationSchema } from './pagination';

// Feature 018: shared classification and consent enums as Zod schemas
export const notificationClassSchema = z.enum(['TRANSACTIONAL', 'OPERATIONAL', 'MARKETING']);
export type NotificationClassInput = z.infer<typeof notificationClassSchema>;

export const consentChangeSourceSchema = z.enum(['unsubscribe_link', 'operator_override', 're_opt_in']);
export type ConsentChangeSourceInput = z.infer<typeof consentChangeSourceSchema>;

export const listNotificationsQuerySchema = paginationSchema.extend({
  tenantId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']).optional(),
  // Feature 018: include SKIPPED and SKIPPED_OPT_OUT in the filter so operators can query suppressed notifications
  status: z.enum(['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED', 'SKIPPED_OPT_OUT']).optional(),
  templateCode: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt', 'sentAt', 'status']).default('createdAt'),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const upsertNotificationTemplateSchema = z.object({
  subject: z.string().min(1).max(255).optional(),
  bodyHtml: z.string().min(1).optional(),
  bodyText: z.string().min(1),
  isActive: z.boolean(),
  // Feature 018: optional on upsert — defaults to OPERATIONAL server-side, protected templates enforce TRANSACTIONAL
  notificationClass: notificationClassSchema.optional(),
});
export type UpsertNotificationTemplateInput = z.infer<typeof upsertNotificationTemplateSchema>;

export const listNotificationTemplatesQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  templateCode: z.string().optional(),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']).optional(),
  includeDefaults: z.coerce.boolean().default(true),
});
export type ListNotificationTemplatesQuery = z.infer<typeof listNotificationTemplatesQuerySchema>;

// Feature 018: operator consent management
export const listConsentsQuerySchema = z.object({
  recipient: z.string().min(1),
  tenantId: z.string().uuid().optional(),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']).optional(),
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
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']),
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
