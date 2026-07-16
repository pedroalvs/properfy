import { z } from 'zod';
import { ContactType } from '../enums/contact-type';
import { ContactChannelType } from '../enums/contact-channel-type';
import { AppointmentContactRole } from '../enums/appointment-contact-role';
import { toE164Au } from '../constants/phone';
import { auPhoneSchema } from './phone';

// --- Additional channel entry ---

// Loose shape: used by response schemas so legacy rows (pre-validation data)
// still serialize. Input schemas use additionalChannelInputSchema below.
export const additionalChannelSchema = z.object({
  channel: z.nativeEnum(ContactChannelType),
  value: z.string().min(1).max(254),
  label: z.string().max(100).optional(),
});
export type AdditionalChannel = z.infer<typeof additionalChannelSchema>;

// Strict input variant: validates value per channel type and normalizes
// PHONE values to E.164 (+61...).
export const additionalChannelInputSchema = additionalChannelSchema
  .superRefine((c, ctx) => {
    if (c.channel === ContactChannelType.EMAIL && !z.string().email().safeParse(c.value).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Must be a valid email address',
      });
    }
    if (c.channel === ContactChannelType.PHONE && toE164Au(c.value) === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Must be a valid Australian phone number',
      });
    }
  })
  .transform((c) =>
    c.channel === ContactChannelType.PHONE && toE164Au(c.value) !== null
      ? { ...c, value: toE164Au(c.value) as string }
      : c,
  );

// --- Contact registry (create) ---

export const contactRegistrySchema = z
  .object({
    // 024 §FR-308: AM/OP may post `tenantId` explicitly to pin the new
    // contact to a tenant, omit it (auto-null = standalone), or send `null`
    // explicitly. CL_ADMIN/CL_USER ignore the body field — the use case
    // resolves their tenant from JWT (preserves 021 behaviour).
    tenantId: z.string().uuid().nullable().optional(),
    type: z.nativeEnum(ContactType),
    displayName: z.string().min(1).max(200),
    company: z.string().min(1).max(200).optional().nullable(),
    primaryEmail: z.string().email().max(254).optional().nullable(),
    primaryPhone: auPhoneSchema.optional().nullable(),
    additionalChannels: z.array(additionalChannelInputSchema).max(10).default([]),
    notes: z.string().optional().nullable(),
  })
  .refine(
    (data) => data.primaryEmail != null || data.primaryPhone != null,
    { message: 'At least one of primaryEmail or primaryPhone is required', path: ['primaryEmail'] },
  )
  .refine(
    (data) => {
      const channels = data.additionalChannels;
      if (data.primaryEmail) {
        if (channels.some((c) => c.channel === 'EMAIL' && c.value === data.primaryEmail)) return false;
      }
      if (data.primaryPhone) {
        if (channels.some((c) => c.channel === 'PHONE' && c.value === data.primaryPhone)) return false;
      }
      return true;
    },
    { message: 'Additional channels must not duplicate primary email or phone', path: ['additionalChannels'] },
  )
  .refine(
    (data) => {
      const channels = data.additionalChannels;
      const keys = channels.map((c) => `${c.channel}:${c.value}`);
      return new Set(keys).size === keys.length;
    },
    { message: 'Duplicate entries in additional channels', path: ['additionalChannels'] },
  );
export type ContactRegistryInput = z.infer<typeof contactRegistrySchema>;

// --- Contact registry (update / patch) ---

export const contactRegistryUpdateSchema = z
  .object({
    type: z.nativeEnum(ContactType).optional(),
    displayName: z.string().min(1).max(200).optional(),
    company: z.string().min(1).max(200).optional().nullable(),
    primaryEmail: z.string().email().max(254).optional().nullable(),
    primaryPhone: auPhoneSchema.optional().nullable(),
    additionalChannels: z.array(additionalChannelInputSchema).max(10).optional(),
    notes: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
  });
export type ContactRegistryUpdateInput = z.infer<typeof contactRegistryUpdateSchema>;

// --- Appointment contact linkage ---

const contactIdLink = z.object({
  contactId: z.string().uuid(),
  inline: z.undefined().optional(),
  role: z.nativeEnum(AppointmentContactRole),
  isPrimary: z.boolean(),
});

const inlineLink = z.object({
  contactId: z.undefined().optional(),
  inline: z.object({
    type: z.nativeEnum(ContactType),
    displayName: z.string().min(1).max(200),
    company: z.string().min(1).max(200).optional().nullable(),
    primaryEmail: z.string().email().max(254).optional().nullable(),
    primaryPhone: auPhoneSchema.optional().nullable(),
    additionalChannels: z.array(additionalChannelInputSchema).max(10).default([]),
    notes: z.string().optional().nullable(),
  }),
  role: z.nativeEnum(AppointmentContactRole),
  isPrimary: z.boolean(),
});

export const appointmentContactLinkSchema = contactIdLink.or(inlineLink);

// Array of contact links with exactly-one-primary validation
export const appointmentContactsArraySchema = z
  .array(contactIdLink.or(inlineLink))
  .min(1, 'At least one contact is required')
  .refine(
    (contacts) => {
      const primaryCount = contacts.filter((c) => c.isPrimary).length;
      return primaryCount === 1;
    },
    { message: 'Exactly one contact must have isPrimary = true' },
  );

export type AppointmentContactLinkInput = z.infer<typeof contactIdLink> | z.infer<typeof inlineLink>;
export type AppointmentContactsArrayInput = z.infer<typeof appointmentContactsArraySchema>;

// --- Contact response schemas (canonical detail/payload + list row + sub-resource items) ---

/**
 * Canonical contact detail/payload shape used by every single-contact route
 * (GET :id, POST, PATCH, POST :id/deactivate). Mirrors `propertyResponseSchema`.
 *
 * 024 §FR-301 — `tenantId` is nullable: standalone contacts (created by
 * AM/OP without an appointment context) carry `tenantId = null` until
 * linked via `appointment_contacts`.
 */
export const contactResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  type: z.nativeEnum(ContactType),
  displayName: z.string(),
  company: z.string().nullable(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  additionalChannels: z.array(additionalChannelSchema),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ContactResponse = z.infer<typeof contactResponseSchema>;

/**
 * List-row variant: lighter fields + `propertyCount` aggregation +
 * `primaryInPropertyCount` (number of distinct properties on which this
 * contact is the primary recipient across non-CANCELLED/REJECTED appointments;
 * powers the "Primary in N" column in the Contacts list — 023 §FR-202).
 *
 * 024 §FR-301 — `tenantId` is nullable for parity with `contactResponseSchema`.
 */
export const contactListItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  type: z.nativeEnum(ContactType),
  displayName: z.string(),
  company: z.string().nullable(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  isActive: z.boolean(),
  propertyCount: z.number().int().nonnegative(),
  primaryInPropertyCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ContactListItem = z.infer<typeof contactListItemSchema>;

/** Appointment item under GET /v1/contacts/:id?includeAppointments=true. */
export const contactAppointmentItemSchema = z.object({
  appointmentId: z.string().uuid(),
  appointmentNumber: z.number().int(),
  status: z.string(),
  scheduledDate: z.string().datetime(),
  role: z.nativeEnum(AppointmentContactRole),
  isPrimary: z.boolean(),
  propertyId: z.string().uuid(),
  propertyCode: z.string(),
});
export type ContactAppointmentItem = z.infer<typeof contactAppointmentItemSchema>;

/** Property aggregate row under GET /v1/contacts/:id?includeProperties=true. */
export const contactPropertyAggregateSchema = z.object({
  propertyId: z.string().uuid(),
  propertyCode: z.string(),
  street: z.string(),
  suburb: z.string(),
  postcode: z.string(),
  state: z.string(),
  appointmentCount: z.number().int(),
  isPrimaryInActiveAppointment: z.boolean(),
});
export type ContactPropertyAggregateResponse = z.infer<typeof contactPropertyAggregateSchema>;

// --- Legacy schema (kept for backward compat during expand phase) ---

/** @deprecated Use contactRegistrySchema instead. Kept for existing consumers during the expand phase. */
export const contactSchema = z.object({
  rentalTenantName: z.string().min(1).max(200),
  primaryEmail: z.string().email().max(254).optional(),
  primaryPhone: auPhoneSchema.optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;
