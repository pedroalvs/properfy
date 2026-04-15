import { z } from 'zod';
import { ContactType } from '../enums/contact-type';
import { ContactChannelType } from '../enums/contact-channel-type';
import { AppointmentContactRole } from '../enums/appointment-contact-role';

// --- Additional channel entry ---

export const additionalChannelSchema = z.object({
  channel: z.nativeEnum(ContactChannelType),
  value: z.string().min(1).max(254),
  label: z.string().max(100).optional(),
});
export type AdditionalChannel = z.infer<typeof additionalChannelSchema>;

// --- Contact registry (create) ---

export const contactRegistrySchema = z
  .object({
    tenantId: z.string().uuid().optional(), // AM only — OP/CL resolved from JWT
    type: z.nativeEnum(ContactType),
    displayName: z.string().min(1).max(200),
    company: z.string().min(1).max(200).optional().nullable(),
    primaryEmail: z.string().email().max(254).optional().nullable(),
    primaryPhone: z.string().min(1).max(30).optional().nullable(),
    additionalChannels: z.array(additionalChannelSchema).max(10).default([]),
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
    primaryPhone: z.string().min(1).max(30).optional().nullable(),
    additionalChannels: z.array(additionalChannelSchema).max(10).optional(),
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
    primaryPhone: z.string().min(1).max(30).optional().nullable(),
    additionalChannels: z.array(additionalChannelSchema).max(10).default([]),
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

// --- Legacy schema (kept for backward compat during expand phase) ---

/** @deprecated Use contactRegistrySchema instead. Kept for existing consumers during the expand phase. */
export const contactSchema = z.object({
  tenantName: z.string().min(1).max(200),
  primaryEmail: z.string().email().max(254).optional(),
  secondaryEmail: z.string().email().max(254).optional(),
  primaryPhone: z.string().max(30).optional(),
  secondaryPhone: z.string().max(30).optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;
