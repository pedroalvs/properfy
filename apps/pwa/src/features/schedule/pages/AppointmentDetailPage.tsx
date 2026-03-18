import { useParams } from 'react-router-dom';
import { AppointmentStatus } from '@properfy/shared';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { StatusChip } from '@/components/ui/StatusChip';
import { TenantConfirmationBanner } from '../components/TenantConfirmationBanner';
import { PropertyAddressSection } from '../components/PropertyAddressSection';
import { TenantContactSection } from '../components/TenantContactSection';
import { KeyDetailsSection } from '../components/KeyDetailsSection';
import { StartInspectionButton } from '../components/StartInspectionButton';
import { useInspectorAppointment } from '../hooks/useInspectorAppointment';
import { formatDate, formatTime } from '@/lib/format-date';

export function AppointmentDetailPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { data, isLoading, isError, refetch } = useInspectorAppointment(appointmentId!);

  if (isLoading) {
    return (
      <div>
        <TopBar title="Appointment" showBack />
        <div className="px-page-x py-4">
          <LoadingState rows={6} variant="card" />
        </div>
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <div>
        <TopBar title="Appointment" showBack />
        <ErrorState message="Failed to load appointment" onRetry={refetch} />
      </div>
    );
  }

  const apt = data.data;

  return (
    <div data-testid="appointment-detail-page">
      <TopBar title="Appointment" showBack />

      <div className="flex flex-col gap-3 px-page-x py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-text-primary">
              {formatDate(apt.timeSlotStart)}
            </p>
            <p className="text-sm text-text-secondary">
              {formatTime(apt.timeSlotStart)} – {formatTime(apt.timeSlotEnd)}
            </p>
          </div>
          <StatusChip status={apt.status} />
        </div>

        <PropertyAddressSection
          address={apt.propertyAddress}
          latitude={apt.propertyLatitude}
          longitude={apt.propertyLongitude}
        />

        <TenantConfirmationBanner status={apt.tenantConfirmation} />

        <TenantContactSection
          name={apt.tenantName}
          phone={apt.tenantPhone}
          email={apt.tenantEmail}
        />

        <KeyDetailsSection
          keyRequired={apt.keyRequired}
          meetingLocation={apt.meetingLocation}
          restrictions={apt.restrictions}
        />

        {apt.notes && (
          <section className="rounded-lg bg-card-bg p-4">
            <h3 className="text-xs font-bold uppercase text-text-secondary">Notes</h3>
            <p className="mt-1 text-sm text-text-primary">{apt.notes}</p>
          </section>
        )}

        {apt.status === AppointmentStatus.SCHEDULED && (
          <div className="mt-2">
            <StartInspectionButton
              appointmentId={apt.id}
              timeSlotStart={apt.timeSlotStart}
              timeSlotEnd={apt.timeSlotEnd}
            />
          </div>
        )}
      </div>
    </div>
  );
}
