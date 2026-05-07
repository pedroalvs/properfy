import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { TenantConfirmationChip } from './TenantConfirmationChip';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { useAppointmentContactDetail } from '../hooks/useAppointmentContactDetail';

interface ContactDetailDrawerProps {
  contactId: string | null;
  onClose: () => void;
}

export function ContactDetailDrawer({ contactId, onClose }: ContactDetailDrawerProps) {
  const { contact, isLoading, isError, refetch } = useAppointmentContactDetail(contactId);

  return (
    <DrawerPanel open={!!contactId} onClose={onClose} size="narrow" ariaLabel="Contact Details">
      <div className="flex items-center justify-between border-b border-black/10 px-6 py-4">
        <h2 className="text-lg font-semibold text-secondary">Contact Details</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-black/5"
          aria-label="Close drawer"
        >
          <i className="mdi mdi-close text-xl" aria-hidden="true" />
        </button>
      </div>

      <div className="overflow-y-auto" style={{ height: 'calc(100vh - 65px)' }}>
        {isLoading && (
          <div className="p-6">
            <LoadingState rows={6} />
          </div>
        )}

        {isError && (
          <div className="p-6">
            <ErrorState message="Failed to load contact" onRetry={refetch} />
          </div>
        )}

        {contact && (
          <div className="flex flex-col gap-6 p-6">
            <FormSection title="Contact Information">
              <DetailRow label="Name" value={contact.name} />
              <DetailRow label="Email" value={contact.primaryEmail} />
              <DetailRow label="Phone" value={contact.primaryPhone} />
              <DetailRow label="Alternative Phone" value={contact.alternativePhone} />
              <DetailRow
                label="Status"
                value={<TenantConfirmationChip status={contact.confirmationStatus as any} />}
              />
            </FormSection>

            <FormSection title="Appointment">
              <DetailRow label="Property" value={contact.propertyAddress} />
              <DetailRow
                label="Date"
                value={contact.appointmentDate ? formatDate(contact.appointmentDate) : null}
              />
              <DetailRow
                label="Last Activity"
                value={contact.lastActivityAt ? formatDateTime(contact.lastActivityAt) : null}
              />
            </FormSection>

            {contact.notes && (
              <FormSection title="Notes">
                <p className="whitespace-pre-wrap text-sm text-text-secondary">{contact.notes}</p>
              </FormSection>
            )}

            <FormSection title="Record">
              <DetailRow label="Created" value={formatDateTime(contact.createdAt)} />
              <DetailRow label="Updated" value={formatDateTime(contact.updatedAt)} />
            </FormSection>
          </div>
        )}
      </div>
    </DrawerPanel>
  );
}
