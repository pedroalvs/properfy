import { z } from 'zod';

import { toE164Au } from '../constants/phone';

// Contracts for the Fy agent API (`/v1/integrations/fy/*`) — the external
// machine surface consumed by the AutoLabs WhatsApp bot. Authentication is an
// inbound API key carrying the `bot:fy` scope. Naming follows Properfy
// conventions (agency = tenant, property, contact), not the partner spec.

export const fyAppointmentStatusSchema = z.enum([
  'DRAFT',
  'AWAITING_INSPECTOR',
  'SCHEDULED',
  'DONE',
  'CANCELLED',
  'REJECTED',
]);
export type FyAppointmentStatus = z.infer<typeof fyAppointmentStatusSchema>;

/** Inbound status filter accepts `OPEN` as a partner-facing alias. */
const statusWithAlias = z
  .string()
  .transform((s) => (s === 'OPEN' ? 'AWAITING_INSPECTOR' : s))
  .pipe(fyAppointmentStatusSchema);

export const fyPhoneQuerySchema = z.object({
  /** AU phone number; normalised server-side to E.164 (+61…). */
  phone: z
    .string()
    .min(1)
    .refine((v) => toE164Au(v) !== null, { message: 'phone must be a valid AU number' }),
  /** Comma-separated statuses. Default: AWAITING_INSPECTOR,SCHEDULED (+ DONE <48h). */
  statusIn: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()) : undefined))
    .pipe(z.array(statusWithAlias).min(1).optional()),
});
export type FyPhoneQuery = z.infer<typeof fyPhoneQuerySchema>;

export const fyContactSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});
export type FyContact = z.infer<typeof fyContactSchema>;

export const fyAppointmentSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  status: fyAppointmentStatusSchema,
  serviceType: z.object({ id: z.string().uuid(), name: z.string() }),
  scheduledDate: z.string(),
  timeSlotStart: z.string(),
  timeSlotEnd: z.string(),
  propertyAddress: z.string(),
  agency: z.object({ id: z.string().uuid(), name: z.string() }),
});
export type FyAppointmentSummary = z.infer<typeof fyAppointmentSummarySchema>;

export const fyAppointmentsByPhoneSchema = z.object({
  contact: fyContactSchema,
  appointments: z.array(fyAppointmentSummarySchema),
});
export type FyAppointmentsByPhone = z.infer<typeof fyAppointmentsByPhoneSchema>;

export const fyAppointmentDetailSchema = fyAppointmentSummarySchema.extend({
  keyRequired: z.boolean(),
  meetingLocation: z.string().nullable(),
  keyLocation: z.string().nullable(),
  inspector: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  agency: z.object({
    id: z.string().uuid(),
    name: z.string(),
    timezone: z.string(),
  }),
  contact: fyContactSchema.extend({ confirmed: z.boolean() }).nullable(),
  /** Operational notes visible to the inspector (includes notes added by Fy). */
  notes: z.string().nullable(),
  rentalTenantNote: z.string().nullable(),
  /**
   * Unique tenant action link (confirm / cancel / reschedule). `url` is null
   * when no active link exists or it has expired — escalate to a human.
   */
  confirmationLink: z.object({
    url: z.string().nullable(),
    expiresAt: z.string().nullable(),
  }),
});
export type FyAppointmentDetail = z.infer<typeof fyAppointmentDetailSchema>;

export const fyAgencySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  timezone: z.string(),
  branches: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      email: z.string().nullable(),
      address: z.string().nullable(),
    }),
  ),
});
export type FyAgency = z.infer<typeof fyAgencySchema>;

export const fyAvailableDatesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export const fyAvailableDatesSchema = z.object({
  availableDates: z.array(
    z.object({
      date: z.string(),
      timeSlots: z.array(z.object({ start: z.string(), end: z.string() })),
    }),
  ),
});
export type FyAvailableDates = z.infer<typeof fyAvailableDatesSchema>;

export const fyNoteCreateSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});
export type FyNoteCreateInput = z.infer<typeof fyNoteCreateSchema>;

export const fyNoteCreatedSchema = z.object({
  content: z.string(),
  createdAt: z.string().datetime(),
});
export type FyNoteCreated = z.infer<typeof fyNoteCreatedSchema>;

export const fyContactUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().email().max(254).nullable().optional(),
    phone: z
      .string()
      .refine((v) => toE164Au(v) !== null, { message: 'phone must be a valid AU number' })
      .nullable()
      .optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined || v.phone !== undefined, {
    message: 'At least one of name, email or phone is required',
  });
export type FyContactUpdateInput = z.infer<typeof fyContactUpdateSchema>;

export const fyContactUpdatedSchema = z.object({
  contact: fyContactSchema,
});
export type FyContactUpdated = z.infer<typeof fyContactUpdatedSchema>;

export const fyResendNoticeSchema = z.object({
  status: z.literal('QUEUED'),
});
export type FyResendNotice = z.infer<typeof fyResendNoticeSchema>;
