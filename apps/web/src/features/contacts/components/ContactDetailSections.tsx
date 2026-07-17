import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { formatDateTime } from '@/lib/format-date';
import { ContactTypeChip } from './ContactTypeChip';
import { ContactStatusBadge } from './ContactStatusBadge';
import type { ContactDetail } from '../types';
import { formatAuPhone } from '@/lib/phone-mask';

interface ContactDetailSectionsProps {
  contact: ContactDetail;
}

export function ContactDetailSections({ contact }: ContactDetailSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Identification">
        <DetailRow label="Display name" value={contact.displayName} />
        <DetailRow label="Type" value={<ContactTypeChip type={contact.type} />} />
        <DetailRow label="Status" value={<ContactStatusBadge isActive={contact.isActive} />} />
        <DetailRow label="Company" value={contact.company} />
      </FormSection>

      <FormSection title="Primary channels">
        <DetailRow label="Email" value={contact.primaryEmail} />
        <DetailRow label="Phone" value={contact.primaryPhone ? formatAuPhone(contact.primaryPhone) : contact.primaryPhone} />
      </FormSection>

      {contact.additionalChannels.length > 0 && (
        <FormSection title="Additional channels">
          {contact.additionalChannels.map((c, idx) => (
            <DetailRow
              key={`${c.channel}-${c.value}-${idx}`}
              label={`${c.channel === 'EMAIL' ? 'Email' : 'Phone'}${c.label ? ` (${c.label})` : ''}`}
              value={c.value}
            />
          ))}
        </FormSection>
      )}

      {contact.notes && (
        <FormSection title="Observations">
          <DetailRow label="Notes" value={contact.notes} />
        </FormSection>
      )}

      <FormSection title="Record">
        <DetailRow label="Created at" value={formatDateTime(contact.createdAt)} />
        <DetailRow label="Updated at" value={formatDateTime(contact.updatedAt)} />
      </FormSection>
    </div>
  );
}
