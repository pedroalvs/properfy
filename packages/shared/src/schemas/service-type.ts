import { z } from 'zod';
import { paginationSchema } from './pagination';
import {
  SERVICE_TYPE_DURATION_DEFAULT_MINUTES,
  SERVICE_TYPE_DURATION_MAX_MINUTES,
  SERVICE_TYPE_DURATION_MIN_MINUTES,
} from '../constants/service-type';

const durationMinutes = z
  .number()
  .int()
  .min(SERVICE_TYPE_DURATION_MIN_MINUTES)
  .max(SERVICE_TYPE_DURATION_MAX_MINUTES);

export const createServiceTypeSchema = z.object({
  code: z.string().min(1).max(50).trim().toUpperCase(),
  name: z.string().min(1).max(200).trim(),
  flowType: z.enum(['ROUTINE', 'INGOING', 'OUTGOING']),
  requiresRentalTenantConfirmation: z.boolean(),
  // Transitional default until TASK-F04-5 makes the web field required.
  defaultDurationMinutes: durationMinutes.default(SERVICE_TYPE_DURATION_DEFAULT_MINUTES),
});
export type CreateServiceTypeInput = z.infer<typeof createServiceTypeSchema>;

export const updateServiceTypeSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  flowType: z.enum(['ROUTINE', 'INGOING', 'OUTGOING']).optional(),
  requiresRentalTenantConfirmation: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  defaultDurationMinutes: durationMinutes.optional(),
});
export type UpdateServiceTypeInput = z.infer<typeof updateServiceTypeSchema>;

export const listServiceTypesQuerySchema = paginationSchema.extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().max(200).optional(),
});
export type ListServiceTypesQueryInput = z.infer<typeof listServiceTypesQuerySchema>;
