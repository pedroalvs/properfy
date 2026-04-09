import { z } from 'zod';

const TIME_RE = /^\d{2}:\d{2}$/;
const TIME_RANGE_MESSAGE = 'End time must be after start time';

function compareTimes(startTime: string, endTime: string) {
  return startTime.localeCompare(endTime);
}

export const createAppointmentTimeSlotSchema = z.object({
  tenantId: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable().optional(),
  label: z.string().min(1).max(100).trim(),
  startTime: z.string().regex(TIME_RE, 'Must be HH:mm format'),
  endTime: z.string().regex(TIME_RE, 'Must be HH:mm format'),
  sortOrder: z.number().int().min(0).default(0),
}).superRefine((data, ctx) => {
  if (compareTimes(data.startTime, data.endTime) >= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endTime'],
      message: TIME_RANGE_MESSAGE,
    });
  }
});
export type CreateAppointmentTimeSlotInput = z.infer<typeof createAppointmentTimeSlotSchema>;

export const updateAppointmentTimeSlotSchema = z.object({
  label: z.string().min(1).max(100).trim().optional(),
  startTime: z.string().regex(TIME_RE, 'Must be HH:mm format').optional(),
  endTime: z.string().regex(TIME_RE, 'Must be HH:mm format').optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.startTime && data.endTime && compareTimes(data.startTime, data.endTime) >= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endTime'],
      message: TIME_RANGE_MESSAGE,
    });
  }
});
export type UpdateAppointmentTimeSlotInput = z.infer<typeof updateAppointmentTimeSlotSchema>;

export const listAppointmentTimeSlotsQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  includeInactive: z
    .union([z.boolean(), z.string().transform((v) => v === 'true')])
    .optional(),
});
export type ListAppointmentTimeSlotsQueryInput = z.infer<typeof listAppointmentTimeSlotsQuerySchema>;

export const listEffectiveTimeSlotsQuerySchema = z.object({
  branchId: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
});
export type ListEffectiveTimeSlotsQueryInput = z.infer<typeof listEffectiveTimeSlotsQuerySchema>;

export const appointmentTimeSlotResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable(),
  label: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});
export type AppointmentTimeSlotResponse = z.infer<typeof appointmentTimeSlotResponseSchema>;

/** Compact shape used by appointment forms (label + value for select) */
export const effectiveTimeSlotSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  value: z.string(), // "HH:mm-HH:mm" composite
});
export type EffectiveTimeSlot = z.infer<typeof effectiveTimeSlotSchema>;
