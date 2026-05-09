import type { ContactType, ContactChannelType, AppointmentContactRole } from '@properfy/shared';

export interface ContactAdditionalChannel {
  channel: ContactChannelType;
  value: string;
  label?: string;
}

/** Canonical contact registry payload — mirrors backend `contactResponseSchema`. */
export interface Contact {
  id: string;
  tenantId: string;
  type: ContactType;
  displayName: string;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  additionalChannels: ContactAdditionalChannel[];
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Detail view (alias for Contact today; kept distinct in case more fields land). */
export type ContactDetail = Contact;

/** List-row variant with the aggregated `propertyCount`. */
export interface ContactListItem {
  id: string;
  tenantId: string;
  type: ContactType;
  displayName: string;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  isActive: boolean;
  propertyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContactAppointmentItem {
  appointmentId: string;
  appointmentNumber: number;
  status: string;
  scheduledDate: string;
  role: AppointmentContactRole;
  isPrimary: boolean;
  propertyId: string;
  propertyCode: string;
}

export interface ContactPropertyAggregate {
  propertyId: string;
  propertyCode: string;
  street: string;
  suburb: string;
  postcode: string;
  state: string;
  appointmentCount: number;
  isPrimaryInActiveAppointment: boolean;
}

export interface ContactFiltersState {
  search: string;
  type: string;
  isActive: string;
}

export const DEFAULT_FILTERS: ContactFiltersState = {
  search: '',
  type: '',
  isActive: 'true',
};

export interface ContactFormChannelInput {
  channel: ContactChannelType | '';
  value: string;
  label: string;
}

export interface ContactFormData {
  type: string;
  displayName: string;
  company: string;
  primaryEmail: string;
  primaryPhone: string;
  additionalChannels: ContactFormChannelInput[];
  notes: string;
}

export type ContactFormErrors = Partial<Record<keyof ContactFormData | 'additionalChannels', string>>;

export const EMPTY_CONTACT_FORM: ContactFormData = {
  type: '',
  displayName: '',
  company: '',
  primaryEmail: '',
  primaryPhone: '',
  additionalChannels: [],
  notes: '',
};
