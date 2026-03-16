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
});
export type ConfirmAppointmentPortalInput = z.infer<typeof confirmAppointmentPortalSchema>;

// POST /reschedule body
export const rescheduleRequestPortalSchema = z.object({
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  newTimeSlot: z.string().min(1).max(50),
  restrictions: portalRestrictionsSchema,
});
export type RescheduleRequestPortalInput = z.infer<typeof rescheduleRequestPortalSchema>;

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
});
export type ReportUnavailabilityPortalInput = z.infer<typeof reportUnavailabilityPortalSchema>;
