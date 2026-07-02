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
  useJoinGroup,
} from '../hooks/usePortalData';
import type { AvailableGroup, AvailableSlot } from '../types';

const EXPIRED_CODES = new Set(['PORTAL_TOKEN_EXPIRED']);
const INVALID_CODES = new Set(['PORTAL_TOKEN_INVALID', 'PORTAL_TOKEN_NOT_FOUND']);

export function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError, error, refetch } = usePortalData(token ?? '');

  const confirmMutation = useConfirmAppointment(token ?? '');
  const unavailableMutation = useReportUnavailability(token ?? '');

  const [changeTimeOpen, setChangeTimeOpen] = useState(false);
  const [proposeNewDateOpen, setProposeNewDateOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableGroup | null>(null);
  const [joinErrorMessage, setJoinErrorMessage] = useState<string | null>(null);

  const availableGroupsQuery = useAvailableGroups(token ?? '', changeTimeOpen);
  const joinGroupMutation = useJoinGroup(token ?? '');

  const handleDeadlineExpire = useCallback(() => { refetch(); }, [refetch]);

  const handleJoinGroup = useCallback(async () => {
    if (!selectedSlot) return;
    setJoinErrorMessage(null);

    try {
      await joinGroupMutation.mutateAsync({
        groupId: selectedSlot.groupId,
        scheduledDate: selectedSlot.scheduledDate,
        timeSlotStart: selectedSlot.timeSlotStart,
        timeSlotEnd: selectedSlot.timeSlotEnd,
      });
      setChangeTimeOpen(false);
      setSelectedSlot(null);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      setJoinErrorMessage(
        apiError?.code === 'PORTAL_GROUP_SLOT_UNAVAILABLE'
          ? 'This time slot is no longer available. Please pick another one.'
          : 'We could not join this time slot. Please try again.',
      );
    }
  }, [joinGroupMutation, selectedSlot]);

  const handleSelectSlot = useCallback((group: AvailableGroup) => {
    joinGroupMutation.reset();
    setJoinErrorMessage(null);
    setSelectedSlot(group);
  }, [joinGroupMutation]);

  const handleConfirm = useCallback(
    async (rentalTenantNote?: string) => {
      await confirmMutation.mutateAsync({ ...(rentalTenantNote ? { rentalTenantNote } : {}) });
    },
    [confirmMutation],
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
  const isTerminal =
    appointment.status === AppointmentStatus.DONE ||
    appointment.status === AppointmentStatus.REJECTED;
  const hasResponse = !!data.existingResponse;

  const alreadyConfirmed =
    appointment.rentalTenantConfirmationStatus === RentalTenantConfirmationStatus.CONFIRMED;
  const alreadyUnavailable =
    appointment.rentalTenantConfirmationStatus === RentalTenantConfirmationStatus.UNAVAILABLE;

  // Show unified form when appointment is actionable. For the urgent-mode case
  // (already CONFIRMED + past cutoff), the form renders in read-only so the tenant
  // can only use the No (urgent unavailability) path.
  const showForm =
    !isTerminal &&
    !alreadyUnavailable &&
    (!alreadyConfirmed || isReadOnly);

  return (
    <PortalLayout>
      <div className="space-y-4">
        {isReadOnly && (
          <InfoBanner>
            This portal is in restricted mode because the confirmation deadline has passed.
            You can still report an urgent unavailability until the visit starts.
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

        {alreadyConfirmed && !isReadOnly && !isTerminal && (
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
            isReadOnly={isReadOnly}
          />
        )}

        {/* Change time CTA (US2 / §3.5) */}
        {!isTerminal && !isReadOnly && (
          <div className="rounded bg-card-bg p-4 shadow-sm">
            {!changeTimeOpen ? (
              <button
                type="button"
                onClick={() => {
                  setChangeTimeOpen(true);
                  setJoinErrorMessage(null);
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
                      setSelectedSlot(null);
                      setJoinErrorMessage(null);
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
                  selectedSlotKey={selectedSlot ? getAvailableGroupSlotKey(selectedSlot) : undefined}
                  onSelect={handleSelectSlot}
                  onRetry={() => availableGroupsQuery.refetch()}
                />
                {selectedSlot && (
                  <>
                    {joinErrorMessage && (
                      <p
                        className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                        role="alert"
                      >
                        {joinErrorMessage}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleJoinGroup}
                      disabled={joinGroupMutation.isPending}
                      className="w-full rounded bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                    >
                      {joinGroupMutation.isPending ? 'Joining…' : 'Join this time slot'}
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
                <RescheduleForm
                  appointment={appointment}
                  token={token}
                  isReadOnly={isReadOnly}
                />
              </div>
            )}
          </div>
        )}

        <ContactForm contact={contact} token={token} isReadOnly={isReadOnly || isTerminal} />
      </div>
    </PortalLayout>
  );
}
