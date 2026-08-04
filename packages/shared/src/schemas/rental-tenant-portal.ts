import { z } from 'zod';
import { auPhoneSchema } from './phone';
import { HHMM_REGEX } from './appointment';
import { availableSlotSchema, hasUniqueAvailableSlotDays } from './available-slot';
import { RATING_COMMENT_MAX_LENGTH, RATING_MAX, RATING_MIN } from '../lib/rating';

// Token URL param validation
export const portalTokenParam = z.object({
  token: z.string().min(1),
});
export type PortalTokenParam = z.infer<typeof portalTokenParam>;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Weekly availability slot (used in the "No" flow and in the join-group
// rentalTenantNote context). Defined in its own leaf module and re-exported
// here so existing importers keep working — see `./available-slot` for why it
// cannot live in this file.
export { availableSlotSchema, type AvailableSlotSchema } from './available-slot';

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
    availableSlotsJson: z.array(availableSlotSchema).max(7).refine(
      hasUniqueAvailableSlotDays,
      { message: 'Only one availability slot is allowed per day' },
    ).nullable().optional(),
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
      // Occupancy of this window specifically, not of the whole service group:
      // capacity is the window's duration x 2 inspections per hour.
      bookedCount: z.number().int().min(0),
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

// PATCH /contact body
export const updateContactPortalSchema = z
  .object({
    primaryEmail: z.string().email().optional(),
    primaryPhone: auPhoneSchema.optional(),
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

// POST /survey body — the post-execution satisfaction response.
export const submitSatisfactionSurveySchema = z.object({
  rating: z.number().int().min(RATING_MIN).max(RATING_MAX),
  comment: z.string().trim().max(RATING_COMMENT_MAX_LENGTH).optional(),
});
export type SubmitSatisfactionSurveyInput = z.infer<typeof submitSatisfactionSurveySchema>;

export const satisfactionSurveyResponseSchema = z.object({
  rating: z.number().int(),
  comment: z.string().nullable(),
  submittedAt: z.string().datetime(),
  /** True when the call resolved to a response the tenant had already given. */
  alreadySubmitted: z.boolean(),
});
export type SatisfactionSurveyResponse = z.infer<typeof satisfactionSurveyResponseSchema>;

/**
 * Survey block on the portal payload. Present only once the inspection is `DONE`;
 * absent for every other status, and absent on older API deployments — consumers
 * must treat a missing block as "no survey", never as "not eligible yet".
 */
export const portalSurveySchema = z.object({
  eligible: z.boolean(),
  submitted: z.boolean(),
  /** Echo of the tenant's own answer; safe to return to the person who gave it. */
  rating: z.number().int().nullable(),
  comment: z.string().nullable(),
  submittedAt: z.string().datetime().nullable(),
  inspectorName: z.string().nullable(),
});
export type PortalSurvey = z.infer<typeof portalSurveySchema>;

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
