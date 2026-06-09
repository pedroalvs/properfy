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
  channel: z.enum(['EMAIL', 'SMS']).optional(),
  // Feature 018: include SKIPPED and SKIPPED_OPT_OUT in the filter so operators can query suppressed notifications
  status: z.enum(['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED', 'SKIPPED_OPT_OUT']).optional(),
  templateCode: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt', 'sentAt', 'status']).default('createdAt'),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

// Feature 030: per-use image binding metadata (alt text and optional dimensions)
export const imageBindingInputSchema = z.object({
  placeholderKey: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  altText: z.string().max(255).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type ImageBindingInput = z.infer<typeof imageBindingInputSchema>;

export const upsertNotificationTemplateSchema = z.object({
  subject: z.string().min(1).max(255).optional(),
  bodyHtml: z.string().min(1),
  isActive: z.boolean(),
  notificationClass: notificationClassSchema.optional(),
  tenantId: z.string().uuid().optional(),
  imageBindings: z.array(imageBindingInputSchema).optional(),
});
export type UpsertNotificationTemplateInput = z.infer<typeof upsertNotificationTemplateSchema>;

// Feature 030: template image binding read DTO
export const templateImageBindingSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  assetId: z.string().uuid(),
  placeholderKey: z.string(),
  altText: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  publicUrl: z.string().url(),
  createdAt: z.string().datetime(),
});
export type TemplateImageBinding = z.infer<typeof templateImageBindingSchema>;

export const listNotificationTemplatesQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  templateCode: z.string().optional(),
  channel: z.enum(['EMAIL', 'SMS']).optional(),
  includeDefaults: z.coerce.boolean().default(true),
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
// Feature 030: Email image asset schemas
// ---------------------------------------------------------------------------

export const emailAssetStatusSchema = z.enum(['PENDING', 'UPLOADED', 'VERIFIED', 'UPLOAD_FAILED']);
export type EmailAssetStatusInput = z.infer<typeof emailAssetStatusSchema>;

export const emailAssetSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  placeholderKey: z.string().max(64),
  publicUrl: z.string().url(),
  originalFilename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  status: emailAssetStatusSchema,
  everSent: z.boolean(),
  uploadedByUserId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type EmailAsset = z.infer<typeof emailAssetSchema>;

export const requestEmailAssetUploadSchema = z.object({
  placeholderKey: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, 'Invalid placeholder key'),
  filename: z.string().min(1).max(255),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024, 'File must be ≤ 5 MB'),
  tenantId: z.string().uuid().optional(),
});
export type RequestEmailAssetUploadInput = z.infer<typeof requestEmailAssetUploadSchema>;

export const confirmEmailAssetResponseSchema = z.object({
  id: z.string().uuid(),
  placeholderKey: z.string(),
  publicUrl: z.string().url(),
  contentType: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  status: emailAssetStatusSchema,
});
export type ConfirmEmailAssetResponse = z.infer<typeof confirmEmailAssetResponseSchema>;

export const editBindingSchema = z.object({
  altText: z.string().max(255).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type EditBindingInput = z.infer<typeof editBindingSchema>;

/** Server-enforced consent for hard-delete (FR-026a). Missing/false confirm → 400. */
export const deleteEmailAssetSchema = z.object({
  confirm: z.literal(true),
});
export type DeleteEmailAssetInput = z.infer<typeof deleteEmailAssetSchema>;

// ---------------------------------------------------------------------------
// Feature 030: Template preview schemas
// ---------------------------------------------------------------------------

export const templatePreviewRequestSchema = z.object({
  subject: z.string().optional(),
  bodyHtml: z.string().min(1),
  tenantId: z.string().uuid().optional(),
  imageBindings: z.array(imageBindingInputSchema).optional(),
});
export type TemplatePreviewRequest = z.infer<typeof templatePreviewRequestSchema>;

export const templatePreviewResponseSchema = z.object({
  subjectRendered: z.string(),
  htmlRendered: z.string(),
});
export type TemplatePreviewResponse = z.infer<typeof templatePreviewResponseSchema>;
