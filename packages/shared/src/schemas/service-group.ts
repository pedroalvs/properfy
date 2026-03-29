import { z } from 'zod';
import { paginationSchema } from './pagination';

const timeWindowRegex = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

export const createServiceGroupSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(5).max(25),
  serviceTypeId: z.string().uuid(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeWindow: z.string().regex(timeWindowRegex),
  priorityMode: z.enum(['STANDARD', 'PRIORITY_24H']).default('STANDARD'),
});
export type CreateServiceGroupInput = z.infer<typeof createServiceGroupSchema>;

export const updateServiceGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  regionName: z.string().max(255).optional(),
  description: z.string().max(5000).optional(),
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

export const acceptOfferSchema = z.object({});
export type AcceptOfferInput = z.infer<typeof acceptOfferSchema>;

export const listServiceGroupsQuerySchema = paginationSchema.extend({
  tenantId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ACCEPTED', 'CANCELLED', 'REJECTED']).optional(),
  serviceTypeId: z.string().uuid().optional(),
  scheduledDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduledDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priorityMode: z.enum(['STANDARD', 'PRIORITY_24H']).optional(),
});
export type ListServiceGroupsQuery = z.infer<typeof listServiceGroupsQuerySchema>;

export const listMarketplaceOffersQuerySchema = paginationSchema.extend({});
export type ListMarketplaceOffersQuery = z.infer<typeof listMarketplaceOffersQuerySchema>;
