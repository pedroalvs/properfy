import { z } from 'zod';
import { paginationSchema } from './pagination';

// --- Typed JSON field schemas ---

export const paymentMethodEnum = z.enum(['BANK_TRANSFER', 'PAYPAL', 'PIX', 'OTHER']);
export type PaymentMethod = z.infer<typeof paymentMethodEnum>;

export const paymentSettingsSchema = z
  .object({
    bankName: z.string().max(200).optional(),
    accountNumber: z.string().max(50).optional(),
    bsb: z.string().max(20).optional(),
    abn: z.string().max(20).optional(),
    paymentMethod: paymentMethodEnum.optional(),
  })
  .passthrough();
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;

export const serviceTypeEntrySchema = z.object({
  serviceTypeId: z.string().uuid(),
  certified: z.boolean().default(false),
});
export const serviceTypesSchema = z.array(serviceTypeEntrySchema);
export type ServiceTypeEntry = z.infer<typeof serviceTypeEntrySchema>;

export const clientEligibilityEntrySchema = z.object({
  tenantId: z.string().uuid(),
  eligible: z.boolean(),
});
export const clientEligibilitySchema = z.array(clientEligibilityEntrySchema);
export type ClientEligibilityEntry = z.infer<typeof clientEligibilityEntrySchema>;

// --- Inspector CRUD schemas ---

export const createInspectorSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  email: z.string().email().max(254),
  phone: z.string().max(20).optional(),
  paymentSettings: paymentSettingsSchema.default({}),
  regions: z.array(z.string()).default([]),
  regionIds: z.array(z.string().uuid()).default([]),
  serviceTypes: serviceTypesSchema.default([]),
  /** @deprecated Use blockedClients instead */
  clientEligibility: clientEligibilitySchema.default([]),
  // Feedback Round item 1: blocked-clients model
  blockedClients: z.array(z.string().uuid()).default([]),
  // Feedback Round item 6: profile extension
  fullName: z.string().max(300).optional(),
  address: z.record(z.unknown()).optional().nullable(),
  abn: z.string().max(20).optional(),
  dateOfBirth: z.string().date().optional(),
  insuranceFileKey: z.string().optional(),
  insuranceExpiresAt: z.string().date().optional(),
  policeCheckFileKey: z.string().optional(),
  policeCheckExpiresAt: z.string().date().optional(),
});
export type CreateInspectorInput = z.infer<typeof createInspectorSchema>;

export const updateInspectorSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(20).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  paymentSettings: paymentSettingsSchema.optional(),
  regions: z.array(z.string()).optional(),
  regionIds: z.array(z.string().uuid()).optional(),
  serviceTypes: serviceTypesSchema.optional(),
  /** @deprecated Use blockedClients instead */
  clientEligibility: clientEligibilitySchema.optional(),
  blockedClients: z.array(z.string().uuid()).optional(),
  fullName: z.string().max(300).optional().nullable(),
  address: z.record(z.unknown()).optional().nullable(),
  abn: z.string().max(20).optional().nullable(),
  dateOfBirth: z.string().date().optional().nullable(),
  insuranceFileKey: z.string().optional().nullable(),
  insuranceExpiresAt: z.string().date().optional().nullable(),
  policeCheckFileKey: z.string().optional().nullable(),
  policeCheckExpiresAt: z.string().date().optional().nullable(),
});
export type UpdateInspectorInput = z.infer<typeof updateInspectorSchema>;

export const listInspectorsQuerySchema = paginationSchema.extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().max(200).optional(),
  region: z.string().optional(),
  serviceTypeId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
});
export type ListInspectorsQueryInput = z.infer<typeof listInspectorsQuerySchema>;

export const createAvailabilitySlotSchema = z.object({
  inspectorId: z.string().uuid().optional(),
  date: z.string().date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format'),
  region: z.string().optional(),
  regionJson: z.record(z.unknown()).optional(),
  capacity: z.number().int().min(1).default(1),
});
export type CreateAvailabilitySlotInput = z.infer<typeof createAvailabilitySlotSchema>;

export const updateAvailabilitySlotSchema = z.object({
  date: z.string().date().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional(),
  region: z.string().optional(),
  regionJson: z.record(z.unknown()).nullable().optional(),
  capacity: z.number().int().min(1).optional(),
  status: z.enum(['AVAILABLE', 'BOOKED', 'CANCELLED']).optional(),
});
export type UpdateAvailabilitySlotInput = z.infer<typeof updateAvailabilitySlotSchema>;

export const linkInspectorToUserSchema = z.object({
  userId: z.string().uuid(),
});
export type LinkInspectorToUserInput = z.infer<typeof linkInspectorToUserSchema>;

export const listAvailabilitySlotsQuerySchema = paginationSchema.extend({
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  status: z.enum(['AVAILABLE', 'BOOKED', 'CANCELLED']).optional(),
});
export type ListAvailabilitySlotsQueryInput = z.infer<typeof listAvailabilitySlotsQuerySchema>;
