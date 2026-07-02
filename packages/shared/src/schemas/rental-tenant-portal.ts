import { z } from 'zod';
import { HHMM_REGEX } from './appointment';

// Token URL param validation
export const portalTokenParam = z.object({
  token: z.string().min(1),
});
export type PortalTokenParam = z.infer<typeof portalTokenParam>;

// Weekly availability slot (used in "No" flow and in join-group rentalTenantNote context)
const HH_MM = /^\d{2}:\d{2}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DAY_OF_WEEK = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);

export const availableSlotSchema = z
  .object({
    dayOfWeek: DAY_OF_WEEK,
    start: z.string().regex(HH_MM, 'Must be HH:mm'),
    end: z.string().regex(HH_MM, 'Must be HH:mm'),
  })
  .refine((s) => s.start < s.end, { message: 'start must be before end' });

export type AvailableSlotSchema = z.infer<typeof availableSlotSchema>;

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
    availableSlotsJson: z.array(availableSlotSchema).nullable().optional(),
  })
  .optional();

// GET /available-groups response
export const availableGroupsResponseSchema = z.object({
  groups: z.array(
    z.object({
      groupId: z.string().uuid(),
      scheduledDate: z.string().regex(DATE_REGEX),
      timeSlotStart: z.string().regex(HHMM_REGEX, 'Must be HH:mm'),
      timeSlotEnd: z.string().regex(HHMM_REGEX, 'Must be HH:mm'),
      suburb: z.string(),
      inspectorName: z.string(),
      confirmedCount: z.number().int().min(0),
      capacityMax: z.number().int().positive(),
    }),
  ).refine(
    (groups) => groups.every((group) => group.timeSlotStart < group.timeSlotEnd),
    { message: 'End time must be after start time' },
  ),
});
export type AvailableGroupsResponse = z.infer<typeof availableGroupsResponseSchema>;

// POST /join-group request
export const joinGroupRequestSchema = z
  .object({
    groupId: z.string().uuid(),
    scheduledDate: z.string().regex(DATE_REGEX),
    timeSlotStart: z.string().regex(HHMM_REGEX, 'Must be HH:mm'),
    timeSlotEnd: z.string().regex(HHMM_REGEX, 'Must be HH:mm'),
    rentalTenantNote: z.string().max(2000).optional(),
  })
  .refine((data) => data.timeSlotStart < data.timeSlotEnd, {
    message: 'End time must be after start time',
    path: ['timeSlotEnd'],
  });
export type JoinGroupRequestInput = z.infer<typeof joinGroupRequestSchema>;

// POST /join-group response
export const joinGroupResponseSchema = z.object({
  scheduledDate: z.string().regex(DATE_REGEX),
  timeSlotStart: z.string().regex(HHMM_REGEX),
  timeSlotEnd: z.string().regex(HHMM_REGEX),
  rentalTenantConfirmationStatus: z.literal('CONFIRMED'),
  appointmentStatus: z.literal('SCHEDULED'),
  inspector: z.object({ id: z.string().uuid(), name: z.string() }),
}).refine(
  (data) => data.timeSlotStart < data.timeSlotEnd,
  { message: 'End time must be after start time', path: ['timeSlotEnd'] },
);
export type JoinGroupResponse = z.infer<typeof joinGroupResponseSchema>;

// POST /confirm body
export const confirmAppointmentPortalSchema = z.object({
  restrictions: portalRestrictionsSchema,
  rentalTenantNote: z.string().max(2000).optional(),
});
export type ConfirmAppointmentPortalInput = z.infer<typeof confirmAppointmentPortalSchema>;

export const confirmAppointmentPortalResponseSchema = z.object({
  rentalTenantConfirmationStatus: z.literal('CONFIRMED'),
  confirmedAt: z.string().datetime(),
});
export type ConfirmAppointmentPortalResponse = z.infer<typeof confirmAppointmentPortalResponseSchema>;

// POST /reschedule body
export const rescheduleRequestPortalSchema = z.object({
  newDate: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  newTimeSlotStart: z.string().regex(HHMM_REGEX, 'Must be HH:mm'),
  newTimeSlotEnd: z.string().regex(HHMM_REGEX, 'Must be HH:mm'),
  restrictions: portalRestrictionsSchema,
  rentalTenantNote: z.string().max(2000).optional(),
}).refine(
  (data) => data.newTimeSlotStart < data.newTimeSlotEnd,
  { message: 'End time must be after start time', path: ['newTimeSlotEnd'] },
);
export type RescheduleRequestPortalInput = z.infer<typeof rescheduleRequestPortalSchema>;

export const rescheduleRequestPortalResponseSchema = z.object({
  scheduledDate: z.string().regex(DATE_REGEX),
  timeSlotStart: z.string().regex(HHMM_REGEX),
  timeSlotEnd: z.string().regex(HHMM_REGEX),
  rentalTenantConfirmationStatus: z.literal('PENDING'),
}).refine(
  (data) => data.timeSlotStart < data.timeSlotEnd,
  { message: 'End time must be after start time', path: ['timeSlotEnd'] },
);
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
  rentalTenantNote: z.string().max(2000).optional(),
});
export type ReportUnavailabilityPortalInput = z.infer<typeof reportUnavailabilityPortalSchema>;

export const reportUnavailabilityPortalResponseSchema = z.object({
  rentalTenantConfirmationStatus: z.literal('UNAVAILABLE'),
  urgentMode: z.boolean(),
});
export type ReportUnavailabilityPortalResponse = z.infer<typeof reportUnavailabilityPortalResponseSchema>;

// GET /v1/appointments/:id/portal-link response
export const GetPortalLinkResponse = z.object({
  portalUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});
export type GetPortalLinkResponse = z.infer<typeof GetPortalLinkResponse>;

export const PortalLinkErrorCode = z.enum([
  'NO_ACTIVE_PORTAL_TOKEN',
  'PORTAL_TOKEN_NOT_DECRYPTABLE',
  'APPOINTMENT_NOT_FOUND',
]);
export type PortalLinkErrorCode = z.infer<typeof PortalLinkErrorCode>;
