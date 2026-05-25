import { z } from 'zod';

// Token URL param validation
export const portalTokenParam = z.object({
  token: z.string().min(1),
});
export type PortalTokenParam = z.infer<typeof portalTokenParam>;

// Shared restrictions sub-schema
const portalRestrictionsSchema = z
  .object({
    isHome: z.boolean().nullable().optional(),
    unavailableDaysJson: z.array(z.string()).nullable().optional(),
    unavailableHoursJson: z
      .array(
        z.object({
          start: z.string(),
          end: z.string(),
        }),
      )
      .nullable()
      .optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .optional();

// POST /confirm body
export const confirmAppointmentPortalSchema = z.object({
  restrictions: portalRestrictionsSchema,
  tenantNote: z.string().max(2000).optional(),
});
export type ConfirmAppointmentPortalInput = z.infer<typeof confirmAppointmentPortalSchema>;

export const confirmAppointmentPortalResponseSchema = z.object({
  tenantConfirmationStatus: z.literal('CONFIRMED'),
  confirmedAt: z.string().datetime(),
});
export type ConfirmAppointmentPortalResponse = z.infer<typeof confirmAppointmentPortalResponseSchema>;

// POST /reschedule body
export const rescheduleRequestPortalSchema = z.object({
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  newTimeSlot: z.string().min(1).max(50),
  restrictions: portalRestrictionsSchema,
  tenantNote: z.string().max(2000).optional(),
});
export type RescheduleRequestPortalInput = z.infer<typeof rescheduleRequestPortalSchema>;

export const rescheduleRequestPortalResponseSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlot: z.string().min(1).max(50),
  tenantConfirmationStatus: z.literal('PENDING'),
});
export type RescheduleRequestPortalResponse = z.infer<typeof rescheduleRequestPortalResponseSchema>;

// PATCH /contact body
export const updateContactPortalSchema = z
  .object({
    primaryEmail: z.string().email().optional(),
    secondaryEmail: z.string().email().nullable().optional(),
    primaryPhone: z.string().min(8).max(20).optional(),
    secondaryPhone: z.string().min(8).max(20).nullable().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one contact field must be provided',
  });
export type UpdateContactPortalInput = z.infer<typeof updateContactPortalSchema>;

// POST /unavailable body
export const reportUnavailabilityPortalSchema = z.object({
  restrictions: portalRestrictionsSchema,
  tenantNote: z.string().max(2000).optional(),
});
export type ReportUnavailabilityPortalInput = z.infer<typeof reportUnavailabilityPortalSchema>;

export const reportUnavailabilityPortalResponseSchema = z.object({
  tenantConfirmationStatus: z.literal('UNAVAILABLE'),
  urgentMode: z.boolean(),
});
export type ReportUnavailabilityPortalResponse = z.infer<typeof reportUnavailabilityPortalResponseSchema>;
