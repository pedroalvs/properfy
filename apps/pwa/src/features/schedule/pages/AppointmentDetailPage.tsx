import { useParams } from 'react-router-dom';
import { AppointmentStatus } from '@properfy/shared';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { StatusChip } from '@/components/ui/StatusChip';
import { RentalTenantConfirmationBanner } from '../components/RentalTenantConfirmationBanner';
import { PropertyAddressSection } from '../components/PropertyAddressSection';
import { ContactsSection } from '../components/ContactsSection';
import { RestrictionsSection } from '../components/RestrictionsSection';
import { AppsSection } from '../components/AppsSection';
import { KeyDetailsSection } from '../components/KeyDetailsSection';
import { JobDetailsSection } from '../components/JobDetailsSection';
import { StartInspectionButton } from '../components/StartInspectionButton';
import { useInspectorAppointment } from '../hooks/useInspectorAppointment';
import { useLocalExecutionState } from '@/features/execution/hooks/useLocalExecutionState';
import { FLOW_TYPE_MAP } from '@/lib/status-colors';
import { formatScheduleDate, formatTimeWindow } from '../lib/time-slot';

export function AppointmentDetailPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { data, isLoading, isError, refetch, jobDetails } = useInspectorAppointment(appointmentId!);
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

  const showCTA = hasResumableExecution || apt.status === AppointmentStatus.SCHEDULED;
  const flowStyle = FLOW_TYPE_MAP[apt.flowType];

  return (
    <div className="w-full" data-testid="appointment-detail-page">
      <TopBar title={apt.serviceTypeName} showBack />

      <div className="flex flex-col gap-3 px-page-x py-4">
        {/* Overdue banner — critical, shown first */}
        {apt.isOverdue && (
          <section
            className="flex items-center gap-3 rounded-[20px] border border-error/20 bg-error/10 px-4 py-3.5"
            data-testid="overdue-banner"
          >
            <i className="mdi mdi-clock-alert-outline text-xl text-error shrink-0" aria-hidden="true" />
            <p className="text-sm font-semibold text-error">
              Overdue — the scheduled date has passed. Contact your coordinator.
            </p>
          </section>
        )}

        {/* Header: date, time, status */}
        <section className="rounded-[28px] bg-[linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(30,64,175,0.82))] px-5 py-5 text-white shadow-[0_18px_44px_rgba(15,23,42,0.20)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p
                className="mb-1 text-xs font-bold tracking-wide text-white/70"
                data-testid="appointment-code"
              >
                {apt.appointmentCode}
              </p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold">{apt.serviceTypeName}</p>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: flowStyle.bg, color: flowStyle.text ?? '#333' }}
                >
                  {flowStyle.label}
                </span>
              </div>
              {apt.agencyName && (
                <p className="mt-0.5 text-xs text-white/60">{apt.agencyName}</p>
              )}
              <p className="mt-2 text-sm font-semibold text-white/90">
                {formatScheduleDate(apt.scheduledDate)}
              </p>
              <p className="mt-0.5 text-base font-bold text-white">
                {formatTimeWindow(apt.timeSlotStart, apt.timeSlotEnd)}
              </p>
            </div>
            <StatusChip status={apt.status} />
          </div>
        </section>

        {/* Key required — shown early so inspector doesn't miss it */}
        {apt.keyRequired && (
          <KeyDetailsSection
            keyRequired={apt.keyRequired}
            meetingLocation={null}
            restrictions={null}
          />
        )}

        {/* Property location */}
        <PropertyAddressSection
          address={apt.propertyAddress}
          addressLine2={apt.propertyAddressLine2}
          suburb={apt.suburb}
          latitude={apt.propertyLatitude}
          longitude={apt.propertyLongitude}
          propertyType={apt.propertyType}
          privateAreaM2={apt.propertyPrivateAreaM2}
          totalAreaM2={apt.propertyTotalAreaM2}
          furnished={apt.propertyFurnished}
          linenProvided={apt.propertyLinenProvided}
        />

        {/* Tenant confirmation status */}
        <RentalTenantConfirmationBanner status={apt.rentalTenantConfirmation} />

        {/* All appointment contacts (roles, primary badge, extra channels).
            Falls back to the flat single-tenant fields on legacy/cached payloads. */}
        <ContactsSection
          contacts={
            jobDetails?.tenantContacts?.length
              ? jobDetails.tenantContacts
              : apt.rentalTenantName.trim()
                ? [{
                    name: apt.rentalTenantName,
                    phone: apt.rentalTenantPhone,
                    email: apt.rentalTenantEmail,
                    role: 'RENTAL_TENANT',
                    isPrimary: true,
                  }]
                : []
          }
        />

        {/* Linked apps (credentials the inspector needs on site) */}
        <AppsSection apps={apt.apps} />

        {/* On-site details (meeting location; restrictions get their own section below) */}
        {apt.meetingLocation && (
          <KeyDetailsSection
            keyRequired={false}
            meetingLocation={apt.meetingLocation}
            restrictions={null}
          />
        )}

        {/* Scheduling restrictions — structured when available, summary otherwise */}
        <RestrictionsSection restrictions={apt.restrictionDetails ?? []} summary={apt.restrictions} />

        {/* Notes */}
        {apt.notes && (
          <section className="rounded-[20px] border border-black/[0.06] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Notes</p>
            <p className="mt-1 text-sm text-text-primary">{apt.notes}</p>
          </section>
        )}

        {/* Observation */}
        {apt.observation && (
          <section className="rounded-[20px] border border-black/[0.06] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Observation</p>
            <p className="mt-1 text-sm text-text-primary">{apt.observation}</p>
          </section>
        )}

        {/* Custom Fields (read-only) */}
        {apt.customFields.length > 0 && (
          <section className="rounded-[20px] border border-black/[0.06] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Custom Fields</p>
            <dl className="mt-2 space-y-2">
              {apt.customFields.map((field, idx) => (
                <div key={idx}>
                  <dt className="text-xs font-semibold text-text-secondary">{field.label}</dt>
                  <dd className="text-sm text-text-primary">{field.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Job Details */}
        {jobDetails && <JobDetailsSection jobDetails={jobDetails} />}

        {/* CTA */}
        {showCTA && (
          <div className="mt-2 pb-2">
            <StartInspectionButton
              appointmentId={apt.id}
              scheduledDate={apt.scheduledDate}
              timeSlotStart={apt.timeSlotStart}
              resume={hasResumableExecution}
            />
          </div>
        )}
      </div>
    </div>
  );
}
