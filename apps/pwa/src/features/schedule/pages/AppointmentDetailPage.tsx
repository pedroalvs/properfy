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
import { useLocalExecutionState } from '@/features/execution/hooks/useLocalExecutionState';
import { formatScheduleDate, formatTimeWindow } from '../lib/time-slot';

export function AppointmentDetailPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { data, isLoading, isError, refetch } = useInspectorAppointment(appointmentId!);
  const { state: localExecutionState, isRestored } = useLocalExecutionState(appointmentId!);

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
  const hasResumableExecution =
    isRestored &&
    ['IN_PROGRESS', 'FINISHING', 'SUBMITTING', 'ERROR'].includes(localExecutionState.phase);

  return (
    <div className="w-full" data-testid="appointment-detail-page">
      <TopBar title="Appointment" showBack />

      <div className="flex flex-col gap-4 px-page-x py-4">
        {apt.isOverdue && (
          <section
            className="flex items-center gap-3 rounded-2xl border border-error/20 bg-error/10 px-4 py-3"
            data-testid="overdue-banner"
          >
            <i className="mdi mdi-clock-alert-outline text-xl text-error" aria-hidden="true" />
            <p className="text-sm font-medium text-error">
              This appointment is overdue. The scheduled date has passed.
            </p>
          </section>
        )}

        <section className="rounded-[28px] bg-[linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(30,64,175,0.82))] px-5 py-5 text-white shadow-[0_18px_44px_rgba(15,23,42,0.20)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Appointment window</p>
              <p className="mt-2 text-base font-bold">
              {formatScheduleDate(apt.scheduledDate)}
              </p>
              <p className="mt-1 text-sm text-white/80">
              {formatTimeWindow(apt.timeSlot)}
              </p>
            </div>
            <StatusChip status={apt.status} />
          </div>
        </section>

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
          <section className="rounded-[24px] border border-white/70 bg-white/92 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-text-secondary">Notes</h3>
            <p className="mt-1 text-sm text-text-primary">{apt.notes}</p>
          </section>
        )}

        {(hasResumableExecution || apt.status === AppointmentStatus.SCHEDULED) && (
          <div className="mt-2">
            <StartInspectionButton
              appointmentId={apt.id}
              scheduledDate={apt.scheduledDate}
              timeSlot={apt.timeSlot}
              resume={hasResumableExecution}
            />
          </div>
        )}
      </div>
    </div>
  );
}
