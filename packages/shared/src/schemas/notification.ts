import { z } from 'zod';
import { paginationSchema } from './pagination';

export const listNotificationsQuerySchema = paginationSchema.extend({
  tenantId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']).optional(),
  status: z.enum(['PENDING', 'SENT', 'DELIVERED', 'FAILED']).optional(),
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
});
export type UpsertNotificationTemplateInput = z.infer<typeof upsertNotificationTemplateSchema>;

export const listNotificationTemplatesQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  templateCode: z.string().optional(),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']).optional(),
  includeDefaults: z.coerce.boolean().default(true),
});
export type ListNotificationTemplatesQuery = z.infer<typeof listNotificationTemplatesQuerySchema>;
