import { z } from 'zod';
import { paginationSchema } from './pagination';

const timeWindowRegex = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

const exceptionTypeEnum = z.enum(['LOW_DENSITY_REGION', 'ISOLATED_SERVICE', 'PRIORITY_CLIENT']);

/**
 * Schema for creating a service group.
 *
 * Size limits:
 *   - Standard (no exception): min 5, max 25
 *   - LOW_DENSITY_REGION: min 1, max 25
 *   - ISOLATED_SERVICE: min 1, max 3
 *   - PRIORITY_CLIENT: min 1, max 8
 *
 * The shared schema enforces the hard boundary (min 1, max 25).
 * Business-rule limits per exception type are enforced by the domain validator.
 * See: projeto-consolidado/service-group-exceptions.md
 */
export const createServiceGroupSchema = z
  .object({
    appointmentIds: z.array(z.string().uuid()).min(1).max(25),
    serviceTypeId: z.string().uuid(),
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeWindow: z.string().regex(timeWindowRegex),
    name: z.string().min(1).max(255).optional(),
    serviceRegionId: z.string().uuid().optional(),
    description: z.string().max(5000).optional(),
    priorityMode: z.enum(['STANDARD', 'PRIORITY_24H']).default('STANDARD'),
    exceptionType: exceptionTypeEnum.optional(),
    exceptionReason: z.string().min(10).max(1000).optional(),
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
    // Draft-only fields
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    timeWindow: z.string().regex(timeWindowRegex).optional(),
    priorityMode: z.enum(['STANDARD', 'PRIORITY_24H']).optional(),
    exceptionType: exceptionTypeEnum.nullable().optional(),
    exceptionReason: z.string().min(10).max(1000).nullable().optional(),
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
  status: z.enum(['DRAFT', 'PUBLISHED', 'ACCEPTED', 'CANCELLED', 'REJECTED']).optional(),
  serviceTypeId: z.string().uuid().optional(),
  scheduledDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduledDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priorityMode: z.enum(['STANDARD', 'PRIORITY_24H']).optional(),
});
export type ListServiceGroupsQuery = z.infer<typeof listServiceGroupsQuerySchema>;

export const listMarketplaceOffersQuerySchema = paginationSchema.extend({});
export type ListMarketplaceOffersQuery = z.infer<typeof listMarketplaceOffersQuerySchema>;
