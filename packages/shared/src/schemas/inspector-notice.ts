import { z } from 'zod';
import { SYSTEM_INSPECTOR_NOTICE_TYPES, isAllowedPushEndpoint } from '../constants/inspector-notices';
import { paginationSchema } from './pagination';

export const INSPECTOR_NOTICE_TITLE_MAX = 120;
export const INSPECTOR_NOTICE_BODY_MAX = 2000;
export const INSPECTOR_NOTICE_SELECTED_MAX = 500;
export const PUSH_ENDPOINT_MAX = 2048;
export const PUSH_KEY_MAX = 255;

/** Audience chosen by an AM/OP operator when publishing a manual notice. */
export const inspectorNoticeAudienceInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ALL') }),
  z.object({
    type: z.literal('SELECTED'),
    inspectorIds: z
      .array(z.string().uuid())
      .min(1)
      .max(INSPECTOR_NOTICE_SELECTED_MAX)
      .transform((ids) => [...new Set(ids)]),
  }),
  z.object({ type: z.literal('REGION'), regionId: z.string().uuid() }),
]);
export type InspectorNoticeAudienceInput = z.infer<typeof inspectorNoticeAudienceInputSchema>;

export const publishInspectorNoticeSchema = z.object({
  title: z.string().trim().min(1).max(INSPECTOR_NOTICE_TITLE_MAX),
  body: z.string().trim().min(1).max(INSPECTOR_NOTICE_BODY_MAX),
  critical: z.boolean().default(false),
  audience: inspectorNoticeAudienceInputSchema,
});
export type PublishInspectorNoticeInput = z.infer<typeof publishInspectorNoticeSchema>;

/** Persisted/returned audience, including the SYSTEM shape and the region name snapshot. */
export const inspectorNoticeAudienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ALL') }),
  z.object({ type: z.literal('SELECTED'), inspectorIds: z.array(z.string()) }),
  z.object({ type: z.literal('REGION'), regionId: z.string(), regionName: z.string() }),
  z.object({ type: z.literal('SYSTEM'), systemType: z.enum(SYSTEM_INSPECTOR_NOTICE_TYPES) }),
]);
export type InspectorNoticeAudience = z.infer<typeof inspectorNoticeAudienceSchema>;

export const listInspectorNoticesQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
});
export type ListInspectorNoticesQuery = z.infer<typeof listInspectorNoticesQuerySchema>;

export const inspectorNoticeSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  critical: z.boolean(),
  audience: inspectorNoticeAudienceSchema,
  author: z.object({ type: z.enum(['USER', 'SYSTEM']), name: z.string().nullable() }),
  publishedAt: z.string(),
  archivedAt: z.string().nullable(),
  recipientCount: z.number().int(),
  readCount: z.number().int(),
});
export type InspectorNoticeSummary = z.infer<typeof inspectorNoticeSummarySchema>;

export const inspectorNoticeDetailSchema = inspectorNoticeSummarySchema.extend({
  recipients: z.array(
    z.object({
      inspectorId: z.string(),
      inspectorName: z.string(),
      readAt: z.string().nullable(),
      // current status; soft-deleted counts as INACTIVE (L-F02-09)
      inspectorStatus: z.enum(['ACTIVE', 'INACTIVE']),
      // inspectors.user_id IS NOT NULL (L-F02-09)
      hasAppAccess: z.boolean(),
    }),
  ),
});
export type InspectorNoticeDetail = z.infer<typeof inspectorNoticeDetailSchema>;

export const myInspectorNoticeSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  critical: z.boolean(),
  publishedAt: z.string(),
  readAt: z.string().nullable(),
});
export type MyInspectorNotice = z.infer<typeof myInspectorNoticeSchema>;

export const listMyInspectorNoticesQuerySchema = paginationSchema; // sortBy ignored by the use case
export type ListMyInspectorNoticesQuery = z.infer<typeof listMyInspectorNoticesQuerySchema>;

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(PUSH_ENDPOINT_MAX)
    // SSRF guard: the delivery job makes a server-side request to this URL, so it must be
    // a known push service over https (never an internal host or IP literal).
    .refine(isAllowedPushEndpoint, 'Endpoint must be a supported push service URL'),
  expirationTime: z.number().nullable().optional(), // accepted and ignored
  keys: z.object({
    p256dh: z.string().min(1).max(PUSH_KEY_MAX),
    auth: z.string().min(1).max(PUSH_KEY_MAX),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(PUSH_ENDPOINT_MAX),
});
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;

export const pushConfigResponseSchema = z.object({ vapidPublicKey: z.string().nullable() });
export type PushConfigResponse = z.infer<typeof pushConfigResponseSchema>;
