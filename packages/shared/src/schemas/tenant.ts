import { z } from 'zod';
import { paginationSchema } from './pagination';

// Tenant settings sub-schema
export const tenantSettingsSchema = z.object({
  billingPeriod: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('MONTHLY'),
  notificationEmail: z.string().email().max(254).optional(),
  timezone: z.string().max(60).optional(),
  customFields: z.record(z.unknown()).optional(),
}).strict();
export type TenantSettingsInput = z.infer<typeof tenantSettingsSchema>;

// Create tenant
export const createTenantSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  legalName: z.string().min(1).max(200).trim(),
  timezone: z.string().min(1).max(60).default('Australia/Sydney'),
  currency: z.string().length(3).default('AUD'),
  settings: tenantSettingsSchema.optional(),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

// Update tenant (partial, CL_ADMIN field restrictions enforced in use case)
export const updateTenantSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  legalName: z.string().min(1).max(200).trim().optional(),
  timezone: z.string().min(1).max(60).optional(),
  currency: z.string().length(3).optional(),
  settings: tenantSettingsSchema.partial().optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

// Deactivate (used for tenant and branch deactivation)
export const deactivateSchema = z.object({
  reason: z.string().min(1).max(500).trim(),
});
export type DeactivateInput = z.infer<typeof deactivateSchema>;

// Create branch
export const createBranchSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  address: z.record(z.unknown()).optional(),
  contactEmail: z.string().email().max(254).optional(),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

// Update branch
export const updateBranchSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  address: z.record(z.unknown()).optional(),
  contactEmail: z.string().email().max(254).nullish(),
});
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

// List tenants query
export const listTenantsQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'ACTIVE', 'INACTIVE']).optional(),
  search: z.string().max(200).optional(),
});
export type ListTenantsQueryInput = z.infer<typeof listTenantsQuerySchema>;

// List branches query
export const listBranchesQuerySchema = paginationSchema.extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().max(200).optional(),
});
export type ListBranchesQueryInput = z.infer<typeof listBranchesQuerySchema>;
