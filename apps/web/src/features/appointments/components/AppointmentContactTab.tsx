import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { BooleanIcon } from '@/components/ui/BooleanIcon';
import type { AppointmentDetail, AppointmentContactEntry } from '../types';

const ROLE_LABELS: Record<string, string> = {
  TENANT: 'Tenant',
  TENANT_REPRESENTATIVE: 'Tenant Representative',
  HOUSEKEEPER: 'Housekeeper',
  PROPERTY_MANAGER: 'Property Manager',
  BROKER: 'Broker',
  OTHER: 'Other',
};

interface AppointmentContactTabProps {
  appointment: AppointmentDetail;
}

function ContactRow({ contact }: { contact: AppointmentContactEntry }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-black/10 p-3">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm text-text-primary">
          {contact.snapshotName || '\u2014'}
        </span>
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {ROLE_LABELS[contact.role] ?? contact.role}
        </span>
        {contact.isPrimary && (
          <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            Primary
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-secondary">
        <span>
          <i className="mdi mdi-email-outline mr-1 text-xs" aria-hidden="true" />
          {contact.snapshotEmail || '\u2014'}
        </span>
        <span>
          <i className="mdi mdi-phone-outline mr-1 text-xs" aria-hidden="true" />
          {contact.snapshotPhone || '\u2014'}
        </span>
      </div>
    </div>
  );
}

export function AppointmentContactTab({ appointment }: AppointmentContactTabProps) {
  // Use new contacts array if available, fall back to legacy single contact
  const contacts: AppointmentContactEntry[] =
    appointment.contacts && appointment.contacts.length > 0
      ? appointment.contacts
      : [
          {
            contactId: null,
            role: 'TENANT' as AppointmentContactEntry['role'],
            isPrimary: true,
            snapshotName: appointment.contactName,
            snapshotEmail: appointment.contactEmail,
            snapshotPhone: appointment.contactPhone,
          },
        ];

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Contact Information">
        <div className="flex flex-col gap-2">
          {contacts.map((contact, idx) => (
            <ContactRow key={contact.id ?? `contact-${idx}`} contact={contact} />
          ))}
        </div>
      </FormSection>

      <FormSection title="Access Restrictions">
        <DetailRow
          label="Key Required"
          value={<BooleanIcon value={appointment.keyRequired} />}
        />
        <DetailRow
          label="Tenant Home"
          value={<BooleanIcon value={appointment.restrictions?.[0]?.isHome ?? false} />}
        />
        <DetailRow label="Meeting Location" value={appointment.meetingLocation} />
        <DetailRow label="Key Location" value={appointment.keyLocation} />
        <DetailRow label="Restriction Notes" value={appointment.restrictions?.[0]?.notes ?? null} />
      </FormSection>
    </div>
  );
}
