import { z } from 'zod';
import { paginationSchema } from './pagination';
import { contactSchema, appointmentContactsArraySchema } from './contact';
import { restrictionSchema } from './restriction';
import { AppointmentStatus, TenantConfirmationStatus } from '../enums/appointment';
import { CancellationReasonCode, RejectionReasonCode } from '../enums/reason-codes';
import { todayLocalDateString } from '../utils/local-date';

// Inline property for creation (matches createPropertySchema subset)
const inlinePropertySchema = z.object({
  propertyCode: z.string().min(1).max(50).trim(),
  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL']),
  street: z.string().min(1).max(300).trim(),
  addressLine2: z.string().max(200).trim().optional(),
  suburb: z.string().min(1).max(100).trim(),
  postcode: z.string().min(1).max(20).trim(),
  state: z.string().min(1).max(100).trim(),
  country: z.string().min(2).max(100).trim().default('AU'),
  notes: z.string().max(2000).optional(),
});

const timeSlotRegex = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

export const createAppointmentSchema = z.object({
  branchId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  property: inlinePropertySchema.optional(),
  serviceTypeId: z.string().uuid(),
  scheduledDate: z.string().date().refine(
    (val) => val >= todayLocalDateString(),
    { message: 'Scheduled date cannot be in the past' },
  ),
  timeSlot: z.string().regex(timeSlotRegex, 'Must be HH:mm-HH:mm format'),
  /** @deprecated Use `contacts` array instead. Kept for backward compat during transition. */
  contact: contactSchema.optional(),
  /** New contacts array (feature 021). Each entry is { contactId } or { inline } with role + isPrimary. */
  contacts: appointmentContactsArraySchema.optional(),
  restriction: restrictionSchema.optional(),
  keyRequired: z.boolean().default(false),
  meetingLocation: z.string().max(500).optional(),
  keyLocation: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  customFields: z.record(z.unknown()).optional(),
}).refine(
  (data) => !!data.propertyId !== !!data.property,
  { message: 'Must provide either propertyId or property (inline), but not both', path: ['propertyId'] },
).refine(
  (data) => {
    const hasLegacy = data.contact !== undefined;
    const hasNew = data.contacts !== undefined;
    return (hasLegacy || hasNew) && !(hasLegacy && hasNew);
  },
  { message: 'Must provide either contact (legacy) or contacts (array), but not both and not neither', path: ['contacts'] },
);
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  scheduledDate: z.string().date().optional(),
  timeSlot: z.string().regex(timeSlotRegex, 'Must be HH:mm-HH:mm format').optional(),
  keyRequired: z.boolean().optional(),
  meetingLocation: z.string().max(500).nullable().optional(),
  keyLocation: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** @deprecated Use `contacts` array instead. */
  contact: contactSchema.optional(),
  /** New contacts array (feature 021). When present, replaces all junction rows. */
  contacts: appointmentContactsArraySchema.optional(),
  restriction: restrictionSchema.optional(),
  customFields: z.record(z.unknown()).nullable().optional(),
}).refine(
  (data) => {
    if (data.scheduledDate === undefined) return true;
    return data.scheduledDate >= todayLocalDateString();
  },
  { message: 'Scheduled date cannot be in the past', path: ['scheduledDate'] },
).refine(
  (data) => {
    const hasLegacy = data.contact !== undefined;
    const hasNew = data.contacts !== undefined;
    // Both absent is fine (no contact change). Both present is not.
    return !(hasLegacy && hasNew);
  },
  { message: 'Cannot provide both contact and contacts in the same update', path: ['contacts'] },
);
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export const statusTransitionSchema = z.object({
  targetStatus: z.nativeEnum(AppointmentStatus),
  reason: z.string().max(1000).optional(),
  cancellationReasonCode: z.nativeEnum(CancellationReasonCode).optional(),
  rejectionReasonCode: z.nativeEnum(RejectionReasonCode).optional(),
  doneCheckedByUserId: z.string().uuid().optional(),
  crossCheckByUserId: z.string().uuid().optional(),
  inspectorId: z.string().uuid().optional(),
});
export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;

export const listAppointmentsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(AppointmentStatus).optional(),
  serviceTypeId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  inspectorId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  tenantConfirmationStatus: z.nativeEnum(TenantConfirmationStatus).optional(),
  showCancelled: z
    .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
    .optional(),
  overdueOnly: z
    .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
    .optional(),
  ungroupedOnly: z
    .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
    .optional(),
  timeSlot: z.string().regex(timeSlotRegex, 'Must be HH:mm-HH:mm format').optional(),
  contactSearch: z.string().max(200).optional(),
  hasTenantNote: z
    .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
    .optional(),
  confirmationStatus: z.nativeEnum(TenantConfirmationStatus).optional(),
});
export type ListAppointmentsQueryInput = z.infer<typeof listAppointmentsQuerySchema>;

// --- Bulk edit (FR-066..FR-069a) ---

const bulkEditChangesSchema = z.object({
  assignedInspectorId: z.string().uuid().optional(),
  scheduledDate: z.string().date().optional(),
  timeSlot: z.string().regex(timeSlotRegex, 'Must be HH:mm-HH:mm format').optional(),
  branchId: z.string().uuid().optional(),
  serviceTypeId: z.string().uuid().optional(),
  propertyManagerContactId: z.string().uuid().optional(),
}).strict(); // .strict() rejects unknown keys → APPOINTMENT_BULK_FIELD_NOT_ALLOWED

/** Per-field policies the use case applies. Currently only governs the
 *  Property-Manager contact change: `replace` (default — overwrite the existing
 *  PM junction row) or `addIfMissing` (skip appointments that already have a
 *  PM contact and surface them in `failed[]`). */
const bulkEditOptionsSchema = z.object({
  propertyManagerContactPolicy: z.enum(['replace', 'addIfMissing']).optional(),
}).optional();

export const bulkEditAppointmentSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one appointment id is required').max(100, 'Maximum 100 appointments per bulk edit'),
  changes: bulkEditChangesSchema.refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'At least one field must be provided in changes' },
  ),
  options: bulkEditOptionsSchema,
});
export type BulkEditAppointmentInput = z.infer<typeof bulkEditAppointmentSchema>;

export const forceManualConfirmationSchema = z.object({
  tenantConfirmationStatus: z.literal('CONFIRMED'),
  reason: z.string().min(1).max(1000),
});
export type ForceManualConfirmationInput = z.infer<typeof forceManualConfirmationSchema>;
