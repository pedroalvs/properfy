import { z } from 'zod';
import { paginationSchema } from './pagination';

export const createServiceRegionSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  state: z.string().min(1).trim(),
  country: z.string().length(2).trim(),
  suburbIds: z.array(z.string().uuid()).default([]),
});
export type CreateServiceRegionInput = z.infer<typeof createServiceRegionSchema>;

export const updateServiceRegionSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  addSuburbIds: z.array(z.string().uuid()).optional(),
  removeSuburbIds: z.array(z.string().uuid()).optional(),
});
export type UpdateServiceRegionInput = z.infer<typeof updateServiceRegionSchema>;

export const listServiceRegionsQuerySchema = paginationSchema.extend({
  country: z.string().max(10).optional(),
  state: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().max(255).optional(),
});
export type ListServiceRegionsQueryInput = z.infer<typeof listServiceRegionsQuerySchema>;

export const listSuburbsQuerySchema = paginationSchema.extend({
  country: z.string().max(10).optional(),
  state: z.string().max(100).optional(),
  city: z.string().max(150).optional(),
  orphanOnly: z.coerce.boolean().optional(),
  search: z.string().max(255).optional(),
});
export type ListSuburbsQueryInput = z.infer<typeof listSuburbsQuerySchema>;
