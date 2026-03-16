import { z } from 'zod';
import { contactSchema } from './contact';
import { restrictionSchema } from './restriction';
import { AppointmentStatus } from '../enums/appointment';

export const createAppointmentSchema = z.object({
  branchId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  serviceTypeId: z.string().uuid(),
  scheduledDate: z.string().date(),
  timeSlot: z.string().min(1).max(50),
  contact: contactSchema,
  restrictions: z.array(restrictionSchema).optional(),
  keyRequired: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const statusTransitionSchema = z.object({
  targetStatus: z.nativeEnum(AppointmentStatus),
  reason: z.string().max(1000).optional(),
});
export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;

export const importAppointmentsSchema = z.object({
  fileUrl: z.string().url(),
  branchId: z.string().uuid(),
  dryRun: z.boolean().default(false),
});
export type ImportAppointmentsInput = z.infer<typeof importAppointmentsSchema>;
