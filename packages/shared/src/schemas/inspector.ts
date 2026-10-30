import { z } from 'zod';
import { auPhoneSchema } from './phone';
import { paginationSchema } from './pagination';
import { passwordFieldSchema } from './auth';
import { inspectorBaseAddressSchema } from './address';
import { booleanQueryParam } from './boolean-query';

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

// --- Inspector CRUD schemas ---

export const createInspectorSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  // The email is the inspector's login identity, and loginSchema lowercases what
  // the user types while findByEmail matches exactly — so it must be normalised
  // here or the account becomes unreachable.
  email: z.string().email().max(254).transform((v) => v.toLowerCase().trim()),
  // Set by the operator at creation time. Later changes go through
  // POST /v1/inspectors/:inspectorId/reset-password (operator) or
  // POST /v1/auth/change-password (the inspector themselves), never the update path.
  password: passwordFieldSchema,
  phone: auPhoneSchema.optional(),
  paymentSettings: paymentSettingsSchema.default({}),
  regions: z.array(z.string()).default([]),
  regionIds: z.array(z.string().uuid()).default([]),
  serviceTypes: serviceTypesSchema.default([]),
  // Feedback Round item 1: blocked-clients model
  blockedClients: z.array(z.string().uuid()).default([]),
  // Feedback Round item 6: profile extension
  fullName: z.string().max(300).optional(),
  // F01-1: the base address is mandatory on create and geocoded in permanent
  // mode on save. Client-sent latitude/longitude are stripped (never persisted).
  address: inspectorBaseAddressSchema,
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
  email: z.string().email().max(254).transform((v) => v.toLowerCase().trim()).optional(),
  phone: auPhoneSchema.nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  paymentSettings: paymentSettingsSchema.optional(),
  regions: z.array(z.string()).optional(),
  regionIds: z.array(z.string().uuid()).optional(),
  serviceTypes: serviceTypesSchema.optional(),
  blockedClients: z.array(z.string().uuid()).optional(),
  fullName: z.string().max(300).optional().nullable(),
  // F01-1: changeable but NOT removable — optional (omit = keep) and NOT nullable
  // (address:null is a 400), so the base can never be cleared.
  address: inspectorBaseAddressSchema.optional(),
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
  // F01-1: AM/OP-only filter to inspectors without a located base address
  // (base_lat IS NULL). Ignored for CL_* (they cannot see base state).
  missingBaseAddress: booleanQueryParam().optional(),
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

// --- Inspector self-update (INSP role, PATCH /v1/inspectors/me) ---

export const inspectorSelfUpdateSchema = z.object({
  phone: auPhoneSchema.nullable().optional(),
  fullName: z.string().max(300).nullable().optional(),
  paymentSettings: paymentSettingsSchema.optional(),
  // F01-1: the inspector may change its own base address (optional, non-nullable).
  address: inspectorBaseAddressSchema.optional(),
});
export type InspectorSelfUpdateInput = z.infer<typeof inspectorSelfUpdateSchema>;

// --- Inspector app-state heartbeat (INSP role, POST /v1/inspectors/me/app-state) ---

// F01-1 / contract 00.10. Telemetry reported by the app on open. Strip mode:
// unknown keys are dropped. pushPermission mirrors the browser Notification
// permission before F02 (D9); push_enabled = (pushPermission === 'granted').
export const inspectorAppStateSchema = z.object({
  displayMode: z.enum(['standalone', 'browser']),
  pushPermission: z.enum(['granted', 'denied', 'default', 'unsupported']),
  appVersion: z.string().trim().min(1).max(40),
});
export type InspectorAppStateInput = z.infer<typeof inspectorAppStateSchema>;

// --- Inspector document kind enum ---

export const inspectorDocumentKindEnum = z.enum(['INSURANCE', 'POLICE_CHECK']);
export type InspectorDocumentKind = z.infer<typeof inspectorDocumentKindEnum>;
