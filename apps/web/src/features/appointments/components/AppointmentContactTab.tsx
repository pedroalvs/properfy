import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { BooleanIcon } from '@/components/ui/BooleanIcon';
import type { AppointmentDetail } from '../types';

interface AppointmentContactTabProps {
  appointment: AppointmentDetail;
}

export function AppointmentContactTab({ appointment }: AppointmentContactTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Contact Information">
        <DetailRow label="Name" value={appointment.contactName} />
        <DetailRow label="Phone" value={appointment.contactPhone} />
        <DetailRow label="Email" value={appointment.contactEmail} />
      </FormSection>

      <FormSection title="Access Restrictions">
        <DetailRow
          label="Key Required"
          value={<BooleanIcon value={appointment.keyRequired} />}
        />
        <DetailRow
          label="Occupant Home"
          value={<BooleanIcon value={appointment.restrictions?.[0]?.isHome ?? false} />}
        />
        <DetailRow label="Meeting Location" value={appointment.meetingLocation} />
        <DetailRow label="Key Location" value={appointment.keyLocation} />
        <DetailRow label="Restriction Notes" value={appointment.restrictions?.[0]?.notes ?? null} />
      </FormSection>
    </div>
  );
}
