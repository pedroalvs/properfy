import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PreStartPanel } from '../components/PreStartPanel';
import { InProgressPanel } from '../components/InProgressPanel';
import { FinishingPanel } from '../components/FinishingPanel';
import { SubmittingPanel } from '../components/SubmittingPanel';
import { DonePanel } from '../components/DonePanel';
import { ErrorPanel } from '../components/ErrorPanel';
import { FailedSyncBanner } from '../components/FailedSyncBanner';
import { LeaveWarningModal } from '../components/LeaveWarningModal';
import { SyncConfirmModal } from '../components/SyncConfirmModal';
import { PastTimeConfirmModal } from '../components/PastTimeConfirmModal';
import { CantDoSheet } from '@/features/field-events/components/CantDoSheet';
import { useExecutionActions } from '../hooks/useExecutionActions';
import { useInspectorAppointment } from '@/features/schedule/hooks/useInspectorAppointment';
import { useSnackbar } from '@/hooks/useSnackbar';
import { isPastScheduledEnd } from '../lib/isPastScheduledEnd';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { getErrorMessage } from '@/lib/api-error';
import type { CapturedLocation } from '../types';

export function ExecutionPage() {
  const { appointmentId: appointmentIdParam } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const appointmentId = appointmentIdParam!;

  const { data: aptData, isLoading: aptLoading, isError: aptError, error: aptLoadError, refetch: refetchAppointment, jobDetails } = useInspectorAppointment(appointmentId);
  const {
    state,
    clearState,
    isRestored,
    checkIn,
    proceedToFinish,
    requestCheckOut,
    retry,
    confirmStep,
    confirmSync,
    confirmPastTime,
    cancelConfirm,
    isStarting,
    isSubmitting,
  } = useExecutionActions(appointmentId);
  const { showInfo, showError } = useSnackbar();
  const effectiveTimezone = useEffectiveTimezone();
  const resumeBannerShown = useRef(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [cantDoOpen, setCantDoOpen] = useState(false);
  // Set after a confirmed "Can't do this job" so the navigation blocker releases
  // before we leave (the local IN_PROGRESS draft is cleared, but the blocker is
  // disabled synchronously here so the redirect to /schedule is not trapped).
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (isRestored && !resumeBannerShown.current && state.phase !== 'PRE_START' && state.phase !== 'DONE') {
      resumeBannerShown.current = true;
      showInfo('Resuming your inspection in progress');
    }
  }, [isRestored, state.phase, showInfo]);

  const isInProgress =
    state.phase === 'IN_PROGRESS' || state.phase === 'FINISHING' || state.phase === 'SUBMITTING';
  const blocker = useBlocker(isInProgress && !exiting);

  // Leave once the "Can't do" cleanup has released the blocker (runs after the
  // re-render where `exiting` is true, so React Router does not block it).
  useEffect(() => {
    if (exiting) navigate('/schedule', { replace: true });
  }, [exiting, navigate]);

  if (aptLoading || !isRestored) {
    return (
      <div className="pb-safe-b">
        <TopBar title="Inspection" showBack />
        <div className="px-page-x py-4">
          <LoadingState rows={4} variant="card" />
        </div>
      </div>
    );
  }

  const appointment = aptData?.data;
  if (aptError || !appointment) {
    return (
      <div className="pb-safe-b">
        <TopBar title="Inspection" showBack />
        <ErrorState
          message="Unable to load this appointment"
          detail={
            aptLoadError
              ? getErrorMessage(aptLoadError)
              : 'This inspection is not available right now. Reload the page or go back to your schedule.'
          }
          onRetry={() => {
            refetchAppointment();
          }}
        />
      </div>
    );
  }
  const topBarSubtitle = appointment
    ? [appointment.appointmentCode, appointment.propertyAddress, appointment.timeSlotStart].filter(Boolean).join(' · ')
    : undefined;

  const handleStart = (location: CapturedLocation) => {
    setStartError(null);
    checkIn(location).catch((err) => {
      const message = err instanceof Error ? err.message : 'Unable to start inspection';
      // Keep the panel in PRE_START and surface the server message (e.g. a BLOCK
      // 422) both inline and as a toast.
      setStartError(message);
      showError(message);
    });
  };

  const appointmentPastEnd = isPastScheduledEnd(
    appointment.scheduledDate,
    appointment.timeSlotEnd,
    effectiveTimezone,
  );
  const hasInspectionAppLink = Boolean(jobDetails?.inspectionAppLink);

  const handleSubmitRequest = (location: CapturedLocation) => {
    requestCheckOut(location, { hasInspectionAppLink, isPastScheduledEnd: appointmentPastEnd });
  };

  const handleSyncDeclined = () => {
    cancelConfirm();
    showInfo('Sync the inspection in the Inspection App before completing.');
  };

  const handleSaveExit = () => {
    navigate('/schedule');
  };

  return (
    // /execution sits outside PwaLayout, so it gets neither the bottom nav nor the
    // layout's clearance — it has to reserve the home-indicator inset itself.
    <div className="pb-safe-b" data-testid="execution-page">
      {/* /execution is full-bleed (outside PwaLayout). Cap + center the flow on tablet so the cards
          and CTAs don't stretch edge-to-edge. max-w-lg is wider than a phone, so phone is unchanged.
          The modals below stay outside the cap (they position to the viewport). */}
      <div className="mx-auto w-full max-w-lg">
      <TopBar title="Inspection" subtitle={topBarSubtitle} showBack />

      <div className="px-page-x pt-2">
        <FailedSyncBanner />
      </div>

      {state.phase === 'PRE_START' && (
        <PreStartPanel
          propertyAddress={appointment?.propertyAddress ?? ''}
          propertyLatitude={appointment?.propertyLatitude}
          propertyLongitude={appointment?.propertyLongitude}
          onStart={handleStart}
          isStarting={isStarting}
          radiusMeters={appointment?.geofence?.radiusMeters}
          errorMessage={startError}
        />
      )}

      {state.phase === 'IN_PROGRESS' && (
        <InProgressPanel
          startedAt={state.startedAt}
          onFinish={proceedToFinish}
          onCantComplete={() => setCantDoOpen(true)}
        />
      )}

      {state.phase === 'FINISHING' && (
        <FinishingPanel
          onSubmit={handleSubmitRequest}
          isSubmitting={isSubmitting}
          propertyLatitude={appointment?.propertyLatitude}
          propertyLongitude={appointment?.propertyLongitude}
          radiusMeters={appointment?.geofence?.radiusMeters}
        />
      )}

      {state.phase === 'SUBMITTING' && <SubmittingPanel />}

      {state.phase === 'DONE' && (
        <DonePanel
          pendingSync={state.pendingSync}
          onBack={() => {
            if (!state.pendingSync) {
              clearState();
            }
          }}
        />
      )}

      {state.phase === 'ERROR' && (
        <ErrorPanel
          message={state.errorMessage ?? 'An error occurred'}
          onRetry={retry}
          onSaveExit={handleSaveExit}
        />
      )}
      </div>

      {state.phase === 'FINISHING' && confirmStep === 'SYNC' && (
        <SyncConfirmModal onConfirm={confirmSync} onCancel={handleSyncDeclined} />
      )}

      {state.phase === 'FINISHING' && confirmStep === 'PAST_TIME' && (
        <PastTimeConfirmModal onConfirm={confirmPastTime} onCancel={cancelConfirm} />
      )}

      {blocker.state === 'blocked' && (
        <LeaveWarningModal
          onStay={() => blocker.reset()}
          onLeave={() => blocker.proceed()}
        />
      )}

      <CantDoSheet
        open={cantDoOpen}
        onOpenChange={setCantDoOpen}
        appointmentId={appointmentId}
        appointmentCode={appointment.appointmentCode ?? ''}
        propertyAddress={appointment.propertyAddress ?? ''}
        onReported={() => {
          clearState();
          setExiting(true);
        }}
      />
    </div>
  );
}
