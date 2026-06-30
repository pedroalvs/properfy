import { z } from 'zod';
import { paginationSchema } from './pagination';

export const createServiceTypeSchema = z.object({
  code: z.string().min(1).max(50).trim().toUpperCase(),
  name: z.string().min(1).max(200).trim(),
  flowType: z.enum(['ROUTINE', 'INGOING', 'OUTGOING']),
  requiresRentalTenantConfirmation: z.boolean(),
});
export type CreateServiceTypeInput = z.infer<typeof createServiceTypeSchema>;

export const updateServiceTypeSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  flowType: z.enum(['ROUTINE', 'INGOING', 'OUTGOING']).optional(),
  requiresRentalTenantConfirmation: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export type UpdateServiceTypeInput = z.infer<typeof updateServiceTypeSchema>;

export const listServiceTypesQuerySchema = paginationSchema.extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().max(200).optional(),
});
export type ListServiceTypesQueryInput = z.infer<typeof listServiceTypesQuerySchema>;
