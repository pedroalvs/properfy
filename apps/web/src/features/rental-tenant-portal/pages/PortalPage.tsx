import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppointmentStatus, RentalTenantConfirmationStatus } from '@properfy/shared';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { ApiError } from '@/lib/api-error';
import { PortalLayout } from '../components/PortalLayout';
import { PortalErrorState } from '../components/PortalErrorState';
import { AppointmentInfoCard } from '../components/AppointmentInfoCard';
import { InspectionConfirmationForm } from '../components/InspectionConfirmationForm';
import { AvailableGroupsList, getAvailableGroupSlotKey } from '../components/AvailableGroupsList';
import { RescheduleForm } from '../components/RescheduleForm';
import { ContactForm } from '../components/ContactForm';
import { RentalTenantPortalExpiredView } from '../components/RentalTenantPortalExpiredView';
import { RentalTenantPortalInvalidView } from '../components/RentalTenantPortalInvalidView';
import { RentalTenantPortalCancelledView } from '../components/RentalTenantPortalCancelledView';
import { ResponseConfirmationCard } from '../components/ResponseConfirmationCard';
import {
  usePortalData,
  useConfirmAppointment,
  useReportUnavailability,
  useAvailableGroups,
} from '../hooks/usePortalData';
import { useJoinGroupFlow } from '../hooks/useJoinGroupFlow';
import type { AvailableSlot } from '../types';

const EXPIRED_CODES = new Set(['PORTAL_TOKEN_EXPIRED']);
const INVALID_CODES = new Set(['PORTAL_TOKEN_INVALID', 'PORTAL_TOKEN_NOT_FOUND']);

export function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError, error, refetch } = usePortalData(token ?? '');

  const confirmMutation = useConfirmAppointment(token ?? '');
  const unavailableMutation = useReportUnavailability(token ?? '');

  const [changeTimeOpen, setChangeTimeOpen] = useState(false);
  const [proposeNewDateOpen, setProposeNewDateOpen] = useState(false);

  const availableGroupsQuery = useAvailableGroups(token ?? '', changeTimeOpen);
  const { refetch: refetchAvailableGroups } = availableGroupsQuery;
  const handleJoinedSlot = useCallback(() => {
    setChangeTimeOpen(false);
  }, []);
  const handleSlotUnavailable = useCallback(() => {
    refetchAvailableGroups();
  }, [refetchAvailableGroups]);
  const joinGroupFlow = useJoinGroupFlow(token ?? '', {
    onJoined: handleJoinedSlot,
    onSlotUnavailable: handleSlotUnavailable,
  });

  const handleDeadlineExpire = useCallback(() => { refetch(); }, [refetch]);

  const handleConfirm = useCallback(
    async (rentalTenantNote?: string) => {
      try {
        await confirmMutation.mutateAsync({ ...(rentalTenantNote ? { rentalTenantNote } : {}) });
      } catch (err) {
        // Portal open in a stale tab: the appointment may have been cancelled or the
        // cutoff may have passed since load. Refetch so the real state renders.
        if (
          err instanceof ApiError &&
          (err.code === 'PORTAL_APPOINTMENT_INACTIVE' || err.code === 'PORTAL_ACTION_BLOCKED')
        ) {
          void refetch();
        }
        throw err;
      }
    },
    [confirmMutation, refetch],
  );

  const handleUnavailable = useCallback(
    async (input: { rentalTenantNote: string; availableSlotsJson: AvailableSlot[] }) => {
      await unavailableMutation.mutateAsync({
        rentalTenantNote: input.rentalTenantNote,
        restrictions: {
          isHome: false,
          unavailableDaysJson: null,
          unavailableHoursJson: null,
          availableSlotsJson: input.availableSlotsJson,
          notes: null,
        },
      });
    },
    [unavailableMutation],
  );

  if (!token) {
    return (
      <PortalLayout>
        <PortalErrorState
          error={new Error('No portal token provided')}
          onRetry={() => window.location.reload()}
        />
      </PortalLayout>
    );
  }

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded bg-card-bg shadow-sm" />
          ))}
        </div>
      </PortalLayout>
    );
  }

  if (isError || !data) {
    const apiError = error instanceof ApiError ? error : null;
    const errorCode = apiError?.code ?? '';

    if (EXPIRED_CODES.has(errorCode)) {
      return (
        <PortalLayout>
          <RentalTenantPortalExpiredView
            appointment={{
              id: '',
              status: AppointmentStatus.SCHEDULED,
              scheduledDate: '',
              timeSlotStart: '',
              timeSlotEnd: '',
              serviceTypeId: '',
              rentalTenantConfirmationStatus: RentalTenantConfirmationStatus.PENDING,
              keyRequired: false,
              meetingLocation: null,
              notes: null,
            }}
          />
        </PortalLayout>
      );
    }

    if (INVALID_CODES.has(errorCode)) {
      return (
        <PortalLayout>
          <RentalTenantPortalInvalidView />
        </PortalLayout>
      );
    }

    return (
      <PortalLayout>
        <PortalErrorState
          error={error ?? new Error('Failed to load portal data')}
          onRetry={() => refetch()}
        />
      </PortalLayout>
    );
  }

  const { appointment, contact } = data;

  if (appointment.status === AppointmentStatus.CANCELLED) {
    return (
      <PortalLayout>
        <RentalTenantPortalCancelledView agencyPhone={data.agencyPhone} />
      </PortalLayout>
    );
  }

  const isReadOnly = data.token.isReadOnly;
  // Confirmation window closed but the token is still valid: only the Yes path locks.
  // Older API payloads without the field fall back to the legacy behavior (read-only = cutoff).
  const isPastConfirmCutoff = data.token.isPastConfirmCutoff ?? isReadOnly;
  const isTerminal =
    appointment.status === AppointmentStatus.DONE ||
    appointment.status === AppointmentStatus.REJECTED;
  const hasResponse = !!data.existingResponse;

  const alreadyConfirmed =
    appointment.rentalTenantConfirmationStatus === RentalTenantConfirmationStatus.CONFIRMED;
  const alreadyUnavailable =
    appointment.rentalTenantConfirmationStatus === RentalTenantConfirmationStatus.UNAVAILABLE;

  // Show unified form when appointment is actionable. For the urgent-mode case
  // (already CONFIRMED + past cutoff), the form renders with confirm locked so the
  // tenant can only use the No (urgent unavailability) path.
  const showForm =
    !isTerminal &&
    !alreadyUnavailable &&
    (!alreadyConfirmed || isPastConfirmCutoff);

  return (
    <PortalLayout>
      <div className="space-y-4">
        {(isPastConfirmCutoff || isReadOnly) && (
          <InfoBanner>
            The confirmation deadline has passed, so this inspection can no longer be
            confirmed. You can still report that you cannot attend, propose a new date,
            or change to another available time.
          </InfoBanner>
        )}

        {isTerminal && (
          <InfoBanner>
            This appointment is{' '}
            <strong>{appointment.status.toLowerCase().replace('_', ' ')}</strong>.
            No further actions are available.
          </InfoBanner>
        )}

        {hasResponse && !isReadOnly && !isTerminal && (
          <InfoBanner>
            Your response has been recorded. If you need to make further changes, please
            contact the agency directly.
          </InfoBanner>
        )}

        <AppointmentInfoCard
          appointment={appointment}
          deadline={data.deadline}
          onDeadlineExpire={handleDeadlineExpire}
        />

        {data.existingResponse && (
          <ResponseConfirmationCard response={data.existingResponse} isExpired={isReadOnly} />
        )}

        {alreadyConfirmed && !isPastConfirmCutoff && !isTerminal && (
          <div className="rounded bg-card-bg p-6 shadow-sm">
            <div className="flex items-center gap-3 text-success">
              <i className="mdi mdi-check-circle text-2xl" />
              <div>
                <h2 className="text-base font-bold">Attendance Confirmed</h2>
                <p className="text-sm text-text-secondary">
                  Your attendance has been confirmed for this inspection.
                </p>
              </div>
            </div>
          </div>
        )}

        {alreadyUnavailable && !isTerminal && (
          <div className="rounded bg-card-bg p-6 shadow-sm">
            <div className="flex items-center gap-3 text-warning">
              <i className="mdi mdi-calendar-remove text-2xl" />
              <div>
                <h2 className="text-base font-bold">Unavailability Reported</h2>
                <p className="text-sm text-text-secondary">
                  Your unavailability has been recorded. The team will follow up.
                </p>
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <InspectionConfirmationForm
            onConfirm={handleConfirm}
            onUnavailable={handleUnavailable}
            isSubmitting={confirmMutation.isPending || unavailableMutation.isPending}
            confirmDisabled={isPastConfirmCutoff || isReadOnly}
          />
        )}

        {/* Change time CTA (US2 / §3.5) */}
        {!isTerminal && (
          <div className="rounded bg-card-bg p-4 shadow-sm">
            {!changeTimeOpen ? (
              <button
                type="button"
                onClick={() => {
                  setChangeTimeOpen(true);
                  joinGroupFlow.clearError();
                }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Change time
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setChangeTimeOpen(false);
                      joinGroupFlow.clearSelection();
                    }}
                    className="text-sm text-text-muted hover:text-text-primary"
                  >
                    ← Back
                  </button>
                  <span className="text-sm font-medium text-text-primary">
                    Select an available time
                  </span>
                </div>
                <AvailableGroupsList
                  groups={availableGroupsQuery.data?.groups ?? []}
                  isLoading={availableGroupsQuery.isLoading}
                  isError={availableGroupsQuery.isError}
                  selectedSlotKey={
                    joinGroupFlow.selectedSlot
                      ? getAvailableGroupSlotKey(joinGroupFlow.selectedSlot)
                      : undefined
                  }
                  onSelect={joinGroupFlow.selectSlot}
                  onRetry={() => availableGroupsQuery.refetch()}
                />
                {joinGroupFlow.joinErrorMessage && (
                  <p
                    className="rounded border border-error/20 bg-error/10 px-3 py-2 text-sm text-error"
                    role="alert"
                  >
                    {joinGroupFlow.joinErrorMessage}
                  </p>
                )}
                {joinGroupFlow.selectedSlot && (
                  <>
                    <button
                      type="button"
                      onClick={joinGroupFlow.joinSelectedSlot}
                      disabled={joinGroupFlow.isJoining}
                      className="w-full rounded bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                    >
                      {joinGroupFlow.isJoining ? 'Joining…' : 'Join this time slot'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Propose new date CTA (US3 / §3.6) */}
        {!isTerminal && data.rescheduleAllowed !== false && (
          <div className="rounded bg-card-bg p-4 shadow-sm">
            {!proposeNewDateOpen ? (
              <button
                type="button"
                onClick={() => setProposeNewDateOpen(true)}
                className="text-sm font-medium text-text-secondary hover:text-text-primary hover:underline"
              >
                Propose new date
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setProposeNewDateOpen(false)}
                  className="text-sm text-text-muted hover:text-text-primary"
                >
                  ← Back
                </button>
                <RescheduleForm appointment={appointment} token={token} />
              </div>
            )}
          </div>
        )}

        <ContactForm contact={contact} token={token} isReadOnly={isReadOnly || isTerminal} />
      </div>
    </PortalLayout>
  );
}
