/**
 * 023 §FR-258 / T-2-907 — cross-form contract test.
 *
 * Asserts that the `inline` registry sub-payload built by the appointment
 * form (`buildContactsPayload`) is structurally equivalent to the dedicated
 * `/contacts` create payload built by `useContactSave`'s `toCreatePayload`,
 * modulo the appointment-only `role` / `isPrimary` envelope.
 *
 * Why this guard exists: the prior 023 round shipped with
 * `type: ContactType.TENANT` hardcoded for inline contacts, silently
 * downgrading every OWNER/HOUSEKEEPER/BROKER/PROPERTY_MANAGER inline
 * creation to TENANT in the registry. This test will fail loudly if the
 * inline path ever diverges from the dedicated path again.
 */

import { describe, it, expect } from 'vitest';
import { ContactType, ContactChannelType } from '@properfy/shared';
import { buildContactsPayload } from './useAppointmentSave';
import { toCreatePayload } from '@/features/contacts/hooks/useContactSave';
import { EMPTY_FORM_DATA, type AppointmentFormData } from '../types';
import { EMPTY_CONTACT_FORM, type ContactFormData } from '@/features/contacts/types';

const REGISTRY_FIELDS = [
  'type',
  'displayName',
  'company',
  'primaryEmail',
  'primaryPhone',
  'additionalChannels',
  'notes',
] as const;

function pickRegistryFields(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of REGISTRY_FIELDS) {
    if (key in payload) out[key] = payload[key];
  }
  return out;
}

describe('Cross-form contact contract (023 §FR-258 / T-2-907)', () => {
  it('inline appointment-form contact and dedicated /contacts create produce equivalent registry sub-payloads', () => {
    // Dedicated /contacts create — same surface as ContactFormDrawer.
    const contactForm: ContactFormData = {
      ...EMPTY_CONTACT_FORM,
      type: ContactType.PROPERTY_MANAGER,
      displayName: 'Jane Doe',
      company: 'Smith Realty',
      primaryEmail: 'jane@example.com',
      primaryPhone: '+61400000000',
      additionalChannels: [
        { channel: ContactChannelType.EMAIL, value: 'jane.work@example.com', label: 'Work' },
      ],
      notes: 'Preferred contact for inspections',
    };
    const dedicatedPayload = toCreatePayload(contactForm) as Record<string, unknown>;

    // Inline appointment form contact — equivalent inputs.
    const appointmentForm: AppointmentFormData = {
      ...EMPTY_FORM_DATA,
      contacts: [
        {
          key: 'k1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+61400000000',
          role: 'TENANT',
          isPrimary: true,
          contactType: ContactType.PROPERTY_MANAGER,
          company: 'Smith Realty',
          additionalChannels: [
            { channel: ContactChannelType.EMAIL, value: 'jane.work@example.com', label: 'Work' },
          ],
          notes: 'Preferred contact for inspections',
        },
      ],
    };
    const inlinePayload = buildContactsPayload(appointmentForm);
    expect(inlinePayload).toBeDefined();
    const inline = (inlinePayload![0] as { inline: Record<string, unknown> }).inline;

    // Both payloads must agree on every registry-level field.
    expect(pickRegistryFields(inline)).toEqual(pickRegistryFields(dedicatedPayload));
  });

  it('inline payload uses the operator-selected contact type, NOT a hardcoded TENANT (023 regression)', () => {
    const appointmentForm: AppointmentFormData = {
      ...EMPTY_FORM_DATA,
      contacts: [
        {
          key: 'k1',
          name: 'John Owner',
          email: 'owner@example.com',
          phone: '',
          role: 'TENANT',
          isPrimary: true,
          // Pick a non-TENANT type — the prior bug hardcoded TENANT here.
          contactType: ContactType.BROKER,
        },
      ],
    };
    const inlinePayload = buildContactsPayload(appointmentForm);
    const inline = (inlinePayload![0] as { inline: Record<string, unknown> }).inline;
    expect(inline.type).toBe(ContactType.BROKER);
  });

  it('inline-with-existing-contactId path skips the registry payload entirely', () => {
    const appointmentForm: AppointmentFormData = {
      ...EMPTY_FORM_DATA,
      contacts: [
        {
          key: 'k1',
          contactId: 'aaaaaaaa-0000-4000-8000-000000000001',
          name: 'Already Registered',
          email: 'reg@example.com',
          phone: '',
          role: 'TENANT',
          isPrimary: true,
        },
      ],
    };
    const inlinePayload = buildContactsPayload(appointmentForm);
    expect(inlinePayload![0]).not.toHaveProperty('inline');
    expect(inlinePayload![0]).toHaveProperty('contactId');
  });

  it('inline payload omits empty optional fields (parity with dedicated payload)', () => {
    // Dedicated form with NO optional fields filled.
    const contactForm: ContactFormData = {
      ...EMPTY_CONTACT_FORM,
      type: ContactType.TENANT,
      displayName: 'Minimal Contact',
      primaryEmail: 'minimal@example.com',
    };
    const dedicatedPayload = toCreatePayload(contactForm) as Record<string, unknown>;

    const appointmentForm: AppointmentFormData = {
      ...EMPTY_FORM_DATA,
      contacts: [
        {
          key: 'k1',
          name: 'Minimal Contact',
          email: 'minimal@example.com',
          phone: '',
          role: 'TENANT',
          isPrimary: true,
          contactType: ContactType.TENANT,
        },
      ],
    };
    const inlinePayload = buildContactsPayload(appointmentForm);
    const inline = (inlinePayload![0] as { inline: Record<string, unknown> }).inline;

    // Neither payload should carry empty `additionalChannels` arrays or empty
    // optional strings — both omit them.
    for (const optional of ['company', 'additionalChannels', 'notes'] as const) {
      expect(optional in inline).toBe(false);
      expect(optional in dedicatedPayload).toBe(false);
    }
  });
});
