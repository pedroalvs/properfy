import { z } from 'zod';
import { paginationSchema } from './pagination';
import { branchAddressSchema } from './address';

// Email template override sub-schema
const emailTemplateOverrideSchema = z.object({
  subject: z.string().max(200).optional(),
  headerText: z.string().max(2000).optional(),
  footerText: z.string().max(2000).optional(),
  signature: z.string().max(500).optional(),
}).strict();

const shortEmailTemplateOverrideSchema = z.object({
  subject: z.string().max(200).optional(),
  headerText: z.string().max(2000).optional(),
}).strict();

// Tenant settings sub-schema
export const tenantSettingsSchema = z.object({
  // Billing
  billingPeriod: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('MONTHLY'),
  billingDayOfWeek: z.number().int().min(0).max(6).optional(),
  billingDayOfMonth: z.number().int().min(1).max(28).optional(),

  // Notification sender
  notificationEmail: z.string().email().max(254).optional(),
  notificationFromName: z.string().max(100).optional(),
  notificationFromEmail: z.string().email().max(254).optional(),
  smsFromName: z.string().max(11).regex(/^[a-zA-Z0-9]*$/, 'Must be alphanumeric').optional(),

  // Branding
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color').optional(),

  // Feature flags (tenant-level policy)
  allowClientCancellation: z.boolean().default(true),
  allowClientRescheduling: z.boolean().default(true),
  allowClientFinancialView: z.boolean().default(false),
  allowClientReportExport: z.boolean().default(false),
  allowClientUserManagement: z.boolean().default(false),

  // Inspector offer config
  priorityOfferHours: z.number().int().min(1).max(168).default(24),
  inspectorOfferRadiusKm: z.number().min(0).default(2),

  // CL_USER granular permissions
  clUserPermissions: z.array(z.enum([
    'create_appointments',
    'cancel_appointments',
    'reject_appointments',
    'reschedule_appointments',
    'force_confirmation',
    'create_properties',
    'export_reports',
  ])).default([]),

  // Email template overrides (per-event)
  emailTemplates: z.object({
    initial: emailTemplateOverrideSchema.optional(),
    reminder7d: shortEmailTemplateOverrideSchema.optional(),
    reminder5d: shortEmailTemplateOverrideSchema.optional(),
    reminder3d: shortEmailTemplateOverrideSchema.optional(),
    escalation: shortEmailTemplateOverrideSchema.optional(),
    confirmed: shortEmailTemplateOverrideSchema.optional(),
    rescheduled: shortEmailTemplateOverrideSchema.optional(),
    cancelled: shortEmailTemplateOverrideSchema.optional(),
  }).strict().optional(),

  // Settings-level timezone override
  timezone: z.string().max(60).optional(),

  // Freeform escape hatch
  customFields: z.record(z.unknown()).optional(),
}).passthrough();
export type TenantSettingsInput = z.infer<typeof tenantSettingsSchema>;

/**
 * Cross-field validation for billing settings.
 * Call this when billingPeriod is being set or when validating a complete settings object.
 * Not embedded in the schema because `.partial()` updates shouldn't trigger it.
 */
export function validateBillingSettings(settings: Partial<TenantSettingsInput>): { valid: boolean; error?: string } {
  const { billingPeriod, billingDayOfWeek, billingDayOfMonth } = settings;
  if (billingPeriod === 'WEEKLY' || billingPeriod === 'BIWEEKLY') {
    if (billingDayOfWeek === undefined) {
      return { valid: false, error: `billingDayOfWeek is required when billingPeriod is ${billingPeriod}` };
    }
  }
  if (billingPeriod === 'MONTHLY') {
    if (billingDayOfMonth === undefined) {
      return { valid: false, error: 'billingDayOfMonth is required when billingPeriod is MONTHLY' };
    }
  }
  return { valid: true };
}

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

// Activate tenant
export const activateSchema = z.object({
  reason: z.string().min(1).max(500).trim().optional(),
});
export type ActivateInput = z.infer<typeof activateSchema>;

// Create branch
export const createBranchSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  address: branchAddressSchema.optional(),
  contactEmail: z.string().email().max(254).optional(),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

// Update branch
export const updateBranchSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  address: branchAddressSchema.optional(),
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
