import { z } from 'zod';
import { addressSchema } from './address';

export const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  tradingName: z.string().max(200).optional(),
  email: z.string().email().max(254),
  phone: z.string().max(30).optional(),
  address: addressSchema.optional(),
  taxId: z.string().max(50).optional(),
  billingPeriod: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('MONTHLY'),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = createTenantSchema.partial();
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const createBranchSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(30).optional(),
  address: addressSchema.optional(),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
