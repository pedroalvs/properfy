import { useParams } from 'react-router-dom';
import { ClockAlert } from 'lucide-react';
import { AppointmentStatus } from '@properfy/shared';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { StatusChip } from '@/components/ui/StatusChip';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
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
import { getErrorMessage } from '@/lib/api-error';
import { FLOW_TYPE_MAP } from '@/lib/status-colors';
import { formatScheduleDate, formatTimeWindow } from '../lib/time-slot';

export function AppointmentDetailPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { data, isLoading, isError, error, refetch, jobDetails } = useInspectorAppointment(appointmentId!);
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
        <ErrorState
          message="Failed to load appointment"
          detail={error ? getErrorMessage(error) : undefined}
          onRetry={refetch}
        />
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
        {/* Past-date banner — critical, shown first. Same flag as the schedule card:
            the inspection day has passed, NOT the platform's 45-day age rule. A past
            date no longer blocks the start by itself, though the backend still refuses
            a routine inspection the tenant never confirmed. */}
        {apt.isOverdue && (
          <Alert tone="destructive" data-testid="overdue-banner">
            <ClockAlert className="h-5 w-5" aria-hidden="true" />
            <p className="text-sm font-semibold">
              Past date — the scheduled date has passed. Attend to this first.
            </p>
          </Alert>
        )}

        {/* Header: date, time, status */}
        <Card className="bg-muted">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p
                className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
                data-testid="appointment-code"
              >
                {apt.appointmentCode}
              </p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-foreground">{apt.serviceTypeName}</p>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: flowStyle.bg, color: flowStyle.text }}
                >
                  {flowStyle.label}
                </span>
              </div>
              {apt.agencyName && (
                <p className="mt-0.5 text-xs text-muted-foreground">{apt.agencyName}</p>
              )}
              <p className="mt-2 text-sm font-semibold text-foreground">
                {formatScheduleDate(apt.scheduledDate)}
              </p>
              <p className="mt-0.5 text-base font-bold text-foreground">
                {formatTimeWindow(apt.timeSlotStart, apt.timeSlotEnd)}
              </p>
            </div>
            <StatusChip status={apt.status} />
          </div>
        </Card>

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
          <Card>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground">{apt.notes}</p>
          </Card>
        )}

        {/* Observation */}
        {apt.observation && (
          <Card>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Observation</p>
            <p className="mt-1 text-sm text-foreground">{apt.observation}</p>
          </Card>
        )}

        {/* Custom Fields (read-only) */}
        {apt.customFields.length > 0 && (
          <Card>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Custom Fields</p>
            <dl className="mt-2 space-y-2">
              {apt.customFields.map((field, idx) => (
                <div key={idx}>
                  <dt className="text-xs font-semibold text-muted-foreground">{field.label}</dt>
                  <dd className="text-sm text-foreground">{field.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}

        {/* Job Details */}
        {jobDetails && <JobDetailsSection jobDetails={jobDetails} />}

        {/* CTA */}
        {showCTA && (
          <div className="mt-2 pb-2">
            <StartInspectionButton
              appointmentId={apt.id}
              scheduledDate={apt.scheduledDate}
              resume={hasResumableExecution}
            />
          </div>
        )}
      </div>
    </div>
  );
}
