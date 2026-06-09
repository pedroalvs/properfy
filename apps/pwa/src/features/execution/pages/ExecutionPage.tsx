import { useState, useEffect, useRef } from 'react';
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
import { LeaveWarningModal } from '../components/LeaveWarningModal';
import { FailedUploadsModal } from '../components/FailedUploadsModal';
import { useLocalExecutionState } from '../hooks/useLocalExecutionState';
import { useAutoSave } from '../hooks/useAutoSave';
import { useStartInspection } from '../hooks/useStartInspection';
import { useFinishInspection } from '../hooks/useFinishInspection';
import { useAssetUpload } from '../hooks/useAssetUpload';
import { useInspectorAppointment } from '@/features/schedule/hooks/useInspectorAppointment';
import { useSnackbar } from '@/hooks/useSnackbar';
import { canTransition } from '../lib/execution-state-machine';
import type { CapturedLocation, ChecklistResponse } from '../types';
import { getTimeWindowParts } from '@/features/schedule/lib/time-slot';

export function ExecutionPage() {
  const { appointmentId: appointmentIdParam } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const appointmentId = appointmentIdParam!;

  const { data: aptData, isLoading: aptLoading, isError: aptError, refetch: refetchAppointment } = useInspectorAppointment(appointmentId);
  const { state, updateState, clearState, isRestored } = useLocalExecutionState(appointmentId);
  const startMutation = useStartInspection();
  const finishMutation = useFinishInspection();
  const { assets, addAsset, removeAsset, retryFailed, completedAssets } = useAssetUpload(appointmentId);
  const { showInfo, showError } = useSnackbar();
  useAutoSave(state);
  const [showFailedModal, setShowFailedModal] = useState(false);
  const resumeBannerShown = useRef(false);

  useEffect(() => {
    if (isRestored && !resumeBannerShown.current && state.phase !== 'PRE_START' && state.phase !== 'DONE') {
      resumeBannerShown.current = true;
      showInfo('Resuming your inspection in progress');
    }
  }, [isRestored, state.phase, showInfo]);

  const isInProgress = state.phase === 'IN_PROGRESS' || state.phase === 'FINISHING';
  const blocker = useBlocker(isInProgress);

  if (aptLoading || !isRestored) {
    return (
      <div>
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
      <div>
        <TopBar title="Inspection" showBack />
        <ErrorState
          message="Unable to load this appointment"
          detail="This inspection is not available right now. Reload the page or go back to your schedule."
          onRetry={() => {
            refetchAppointment();
          }}
        />
      </div>
    );
  }
  const topBarSubtitle = appointment
    ? [appointment.appointmentCode, appointment.propertyAddress, appointment.timeSlot ? getTimeWindowParts(appointment.timeSlot).startTime : null].filter(Boolean).join(' · ')
    : undefined;

  const handleStart = async (location: CapturedLocation) => {
    if (!canTransition(state.phase, 'IN_PROGRESS')) return;

    try {
      await startMutation.mutateAsync({ appointmentId, location });
      updateState({
        phase: 'IN_PROGRESS',
        startLocation: location,
        startedAt: location.capturedAt,
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to start inspection');
    }
  };

  const handleChecklistChange = (response: ChecklistResponse) => {
    updateState((prev) => ({
      ...prev,
      checklistResponses: [
        ...prev.checklistResponses.filter((r) => r.itemId !== response.itemId),
        response,
      ],
    }));
  };

  const uploadingCount = assets.filter((a) => a.status === 'uploading' || a.status === 'pending').length;
  const hasUploadsInProgress = uploadingCount > 0;

  const requiredItems = state.checklistTemplate.filter((item) => item.required);
  const requiredRemaining = requiredItems.filter(
    (item) => !state.checklistResponses.some((r) => r.itemId === item.id && r.value !== null),
  ).length;

  const isChecklistComplete = requiredRemaining === 0;

  const failedAssets = assets.filter((a) => a.status === 'error');

  const handleProceedToFinish = () => {
    if (!canTransition(state.phase, 'FINISHING')) return;
    if (failedAssets.length > 0) {
      setShowFailedModal(true);
      return;
    }
    updateState({ phase: 'FINISHING' });
  };

  const handleSkipFailedPhotos = () => {
    setShowFailedModal(false);
    updateState({ phase: 'FINISHING' });
  };

  const handleRetryFailedPhotos = () => {
    setShowFailedModal(false);
    retryFailed();
  };

  const handleSubmit = async (location: CapturedLocation) => {
    if (!canTransition(state.phase, 'SUBMITTING')) return;
    updateState({ phase: 'SUBMITTING', finishLocation: location });

    try {
      const result = await finishMutation.mutateAsync({
        appointmentId,
        location,
        checklist: state.checklistResponses,
        notes: state.notes,
        assets: completedAssets,
      });
      const queuedOffline = result.data.status === 'QUEUED';
      updateState({
        phase: 'DONE',
        pendingSync: queuedOffline,
        errorMessage: null,
      });
    } catch (err) {
      updateState({
        phase: 'ERROR',
        pendingSync: false,
        errorMessage: err instanceof Error ? err.message : 'Submission failed',
      });
    }
  };

  const handleRetry = () => {
    if (state.finishLocation && canTransition(state.phase, 'SUBMITTING')) {
      handleSubmit(state.finishLocation);
    }
  };

  const handleSaveExit = () => {
    navigate('/schedule');
  };

  return (
    <div data-testid="execution-page">
      <TopBar title="Inspection" subtitle={topBarSubtitle} showBack />

      {state.phase === 'PRE_START' && (
        <PreStartPanel
          propertyAddress={appointment?.propertyAddress ?? ''}
          propertyLatitude={appointment?.propertyLatitude}
          propertyLongitude={appointment?.propertyLongitude}
          onStart={handleStart}
          isStarting={startMutation.isPending}
        />
      )}

      {state.phase === 'IN_PROGRESS' && (
        <InProgressPanel
          checklistTemplate={state.checklistTemplate}
          checklistResponses={state.checklistResponses}
          onChecklistChange={handleChecklistChange}
          assets={assets}
          onAddPhoto={addAsset}
          onDeleteAsset={removeAsset}
          notes={state.notes}
          onNotesChange={(notes) => updateState({ notes })}
          onFinish={handleProceedToFinish}
          isComplete={isChecklistComplete && !hasUploadsInProgress}
          uploadingCount={uploadingCount}
          requiredRemaining={requiredRemaining}
        />
      )}

      {state.phase === 'FINISHING' && (
        <FinishingPanel
          checklistCount={state.checklistResponses.length}
          assetCount={assets.length}
          notes={state.notes}
          onSubmit={handleSubmit}
          isSubmitting={finishMutation.isPending}
          propertyLatitude={appointment?.propertyLatitude}
          propertyLongitude={appointment?.propertyLongitude}
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
          onRetry={handleRetry}
          onSaveExit={handleSaveExit}
        />
      )}

      {showFailedModal && (
        <FailedUploadsModal
          failedCount={failedAssets.length}
          onSkip={handleSkipFailedPhotos}
          onRetry={handleRetryFailedPhotos}
        />
      )}

      {blocker.state === 'blocked' && (
        <LeaveWarningModal
          onStay={() => blocker.reset()}
          onLeave={() => blocker.proceed()}
        />
      )}
    </div>
  );
}
