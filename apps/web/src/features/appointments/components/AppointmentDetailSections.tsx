import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { BooleanIcon } from '@/components/ui/BooleanIcon';
import { TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';
import { formatDate, formatDateTime } from '@/lib/format-date';
import type { AppointmentDetail } from '../types';

interface AppointmentDetailSectionsProps {
  appointment: AppointmentDetail;
}

export function AppointmentDetailSections({ appointment }: AppointmentDetailSectionsProps) {
  const confirmationStyle = TENANT_CONFIRMATION_STATUS_MAP[appointment.tenantConfirmationStatus];

  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Inspection Details">
        <DetailRow label="Service Type" value={appointment.serviceTypeName} />
        <DetailRow label="Address" value={appointment.propertyAddress} />
        <DetailRow label="Branch" value={appointment.branchName} />
        <DetailRow label="Scheduled Date" value={formatDate(appointment.scheduledDate)} />
        <DetailRow label="Time Slot" value={appointment.timeSlot} />
        <DetailRow label="Inspector" value={appointment.inspectorName} />
      </FormSection>

      <FormSection title="Contact">
        <DetailRow label="Name" value={appointment.contactName} />
        <DetailRow label="Phone" value={appointment.contactPhone} />
        <DetailRow label="Email" value={appointment.contactEmail} />
      </FormSection>

      <FormSection title="Access">
        <DetailRow
          label="Key Required"
          value={<BooleanIcon value={appointment.keyRequired} />}
        />
        <DetailRow label="Meeting Point" value={appointment.meetingLocation} />
        <DetailRow label="Key Location" value={appointment.keyLocation} />
      </FormSection>

      <FormSection title="Tenant Confirmation">
        <DetailRow
          label="Status"
          value={
            <span
              className="inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
              style={{ backgroundColor: confirmationStyle.bg, color: confirmationStyle.text }}
            >
              {confirmationStyle.label}
            </span>
          }
        />
      </FormSection>

      {appointment.notes && (
        <FormSection title="Notes">
          <DetailRow label="Notes" value={appointment.notes} />
        </FormSection>
      )}

      <FormSection title="Record">
        <DetailRow label="Created At" value={formatDateTime(appointment.createdAt)} />
        <DetailRow label="Updated At" value={formatDateTime(appointment.updatedAt)} />
        {appointment.cancellationReason && (
          <DetailRow label="Cancellation/Rejection Reason" value={appointment.cancellationReason} />
        )}
      </FormSection>
    </div>
  );
}
