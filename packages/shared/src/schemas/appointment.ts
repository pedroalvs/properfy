import { z } from 'zod';
import { paginationSchema } from './pagination';
import { contactSchema } from './contact';
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
  contact: contactSchema,
  restriction: restrictionSchema.optional(),
  keyRequired: z.boolean().default(false),
  meetingLocation: z.string().max(500).optional(),
  keyLocation: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  customFields: z.record(z.unknown()).optional(),
}).refine(
  (data) => !!data.propertyId !== !!data.property,
  { message: 'Must provide either propertyId or property (inline), but not both', path: ['propertyId'] },
);
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  scheduledDate: z.string().date().optional(),
  timeSlot: z.string().regex(timeSlotRegex, 'Must be HH:mm-HH:mm format').optional(),
  keyRequired: z.boolean().optional(),
  meetingLocation: z.string().max(500).nullable().optional(),
  keyLocation: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  contact: contactSchema.optional(),
  restriction: restrictionSchema.optional(),
  customFields: z.record(z.unknown()).nullable().optional(),
}).refine(
  (data) => {
    if (data.scheduledDate === undefined) return true;
    return data.scheduledDate >= todayLocalDateString();
  },
  { message: 'Scheduled date cannot be in the past', path: ['scheduledDate'] },
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
});
export type ListAppointmentsQueryInput = z.infer<typeof listAppointmentsQuerySchema>;

export const forceManualConfirmationSchema = z.object({
  tenantConfirmationStatus: z.literal('CONFIRMED'),
  reason: z.string().min(1).max(1000),
});
export type ForceManualConfirmationInput = z.infer<typeof forceManualConfirmationSchema>;
