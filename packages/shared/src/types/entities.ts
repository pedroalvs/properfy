import type { ContactType } from '../enums/contact-type';
import type { ContactChannelType } from '../enums/contact-channel-type';
import type { AppointmentContactRole } from '../enums/appointment-contact-role';

// --- Contact registry entity ---

export interface AdditionalChannelEntry {
  channel: ContactChannelType;
  value: string;
  label?: string;
}

export interface Contact {
  id: string;
  tenantId: string;
  type: ContactType;
  displayName: string;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  additionalChannels: AdditionalChannelEntry[];
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// --- Appointment contact junction (revised shape) ---

export interface AppointmentContactJunction {
  id: string;
  appointmentId: string;
  contactId: string | null;
  role: AppointmentContactRole;
  isPrimary: boolean;
  snapshotName: string;
  snapshotEmail: string | null;
  snapshotPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
}
