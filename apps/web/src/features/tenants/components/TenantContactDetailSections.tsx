import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { formatDateTime } from '@/lib/format-date';
import { TenantConfirmationStatusChip } from './TenantConfirmationStatusChip';
import type { TenantContactDetail } from '../types';

interface TenantContactDetailSectionsProps {
  contact: TenantContactDetail;
}

export function TenantContactDetailSections({ contact }: TenantContactDetailSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Contact">
        <DetailRow label="Name" value={contact.name} />
        <DetailRow label="Email" value={contact.primaryEmail} />
        <DetailRow label="Phone" value={contact.primaryPhone} />
        <DetailRow label="Alternative Phone" value={contact.alternativePhone} />
      </FormSection>

      <FormSection title="Appointment">
        <DetailRow label="Code" value={contact.appointmentCode} />
        <DetailRow label="Address" value={contact.propertyAddress} />
        <DetailRow label="Appointment Date" value={formatDateTime(contact.appointmentDate)} />
      </FormSection>

      <FormSection title="Confirmation">
        <DetailRow label="Status" value={<TenantConfirmationStatusChip status={contact.confirmationStatus} />} />
        <DetailRow label="Last Activity" value={contact.lastActivityAt ? formatDateTime(contact.lastActivityAt) : null} />
      </FormSection>

      {contact.notes && (
        <FormSection title="Observations">
          <DetailRow label="Notes" value={contact.notes} />
        </FormSection>
      )}

      <FormSection title="Record">
        <DetailRow label="Created At" value={formatDateTime(contact.createdAt)} />
        <DetailRow label="Updated At" value={formatDateTime(contact.updatedAt)} />
      </FormSection>
    </div>
  );
}
