import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { MoreVertical } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { Button } from '@/components/ui/Button';
import { apiGet } from '@/hooks/useApiQuery';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useExecutionActions } from '@/features/execution/hooks/useExecutionActions';
import { captureRequiredLocation } from '@/features/execution/lib/geolocation';
import { isPastScheduledEnd } from '@/features/execution/lib/isPastScheduledEnd';
import { SyncConfirmModal } from '@/features/execution/components/SyncConfirmModal';
import { PastTimeConfirmModal } from '@/features/execution/components/PastTimeConfirmModal';
import { CantDoSheet } from '@/features/field-events/components/CantDoSheet';
import { LateNoticeSheet } from '@/features/field-events/components/LateNoticeSheet';
import type { InspectorAppointmentDetailResponse } from '../types';
import type { InspectorAppointment } from '../types';

const LOCATION_DENIED_MESSAGE =
  'Location is required to check in. Turn on location access and try again.';
const IN_PROGRESS_PHASES = ['IN_PROGRESS', 'FINISHING', 'SUBMITTING', 'ERROR'];

type Busy = 'idle' | 'locating' | 'checking-in' | 'checking-out';

function formatInstantTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

interface AppointmentCardActionsProps {
  appointment: InspectorAppointment;
  /** Whether the appointment is dated today (gate for Check in / Running late). */
  isToday: boolean;
}

export function AppointmentCardActions({ appointment, isToday }: AppointmentCardActionsProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timeZone = useEffectiveTimezone();
  const isOnline = useIsOnline();
  const { showSuccess, showError, showInfo } = useSnackbar();
  const actions = useExecutionActions(appointment.id);
  const [busy, setBusy] = useState<Busy>('idle');
  const [menuOpen, setMenuOpen] = useState(false);
  const [cantDoOpen, setCantDoOpen] = useState(false);
  const [lateOpen, setLateOpen] = useState(false);

  const phase = actions.state.phase;
  const inProgress = actions.isRestored && IN_PROGRESS_PHASES.includes(phase);
  const isDone = phase === 'DONE';
  const code = appointment.appointmentCode;
  const pastEnd = isPastScheduledEnd(appointment.scheduledDate, appointment.timeSlotEnd, timeZone);
  const showRunningLate = isToday && !inProgress && !isDone;

  const doCheckIn = async (location: Awaited<ReturnType<typeof captureRequiredLocation>>) => {
    try {
      const response = await actions.checkIn(location);
      if (!isOnline) {
        showInfo("You're offline. Check-in saved and will sync automatically.");
      } else if (response.outOfRadius) {
        showInfo(
          `You're ${Math.round(response.geolocationDistanceMeters ?? 0)} m from the property. Operations will see this check-in.`,
        );
      } else {
        showSuccess(`Checked in at ${formatInstantTime(response.startedAt, timeZone)}`);
      }
    } catch (err) {
      // A rejected check-in (e.g. BLOCK 422) wrote no local state, so the card
      // stays on "Check in"; surface the server message.
      showError(err instanceof Error ? err.message : 'Unable to check in');
    }
  };

  const handleCheckIn = async () => {
    if (busy !== 'idle') return;
    setBusy('locating');
    let location;
    try {
      location = await captureRequiredLocation();
    } catch {
      setBusy('idle');
      showError(LOCATION_DENIED_MESSAGE);
      return;
    }
    setBusy('checking-in');
    await doCheckIn(location);
    setBusy('idle');
  };

  const handleCheckOut = async () => {
    if (busy !== 'idle') return;
    setBusy('checking-out');
    let hasInspectionAppLink = false;
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ['inspector', 'appointment', appointment.id],
        queryFn: () =>
          apiGet<{ data: InspectorAppointmentDetailResponse['data'] }>(
            `/v1/inspector/appointments/${appointment.id}`,
          ),
        staleTime: 30_000,
      });
      hasInspectionAppLink = Boolean(detail?.data?.jobDetails?.inspectionAppLink);
    } catch {
      // No cached detail and no network — fall back to the full execution page.
      setBusy('idle');
      navigate(`/execution/${appointment.id}`);
      return;
    }
    try {
      const location = await captureRequiredLocation();
      actions.requestCheckOut(location, { hasInspectionAppLink, isPastScheduledEnd: pastEnd });
    } catch {
      showError(LOCATION_DENIED_MESSAGE);
    } finally {
      setBusy('idle');
    }
  };

  const primaryLabel =
    busy === 'locating'
      ? 'Getting your location…'
      : busy === 'checking-in'
        ? 'Checking in…'
        : busy === 'checking-out'
          ? 'Checking out…'
          : inProgress
            ? 'Check out'
            : 'Check in';

  const openSheet = (which: 'cant-do' | 'late') => {
    setMenuOpen(false);
    if (which === 'cant-do') setCantDoOpen(true);
    else setLateOpen(true);
  };

  // A DONE phase means the finish is submitted/pending; no primary action.
  const showPrimary = !isDone && actions.isRestored;
  const checkInDisabledFuture = !inProgress && !isToday;

  return (
    <div className="flex items-stretch gap-2 border-t border-border px-4 py-3">
      {showPrimary && (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Button
            variant={inProgress ? 'primary' : 'success'}
            block
            className="min-h-touch"
            disabled={busy !== 'idle' || checkInDisabledFuture}
            loading={busy !== 'idle'}
            aria-label={`${inProgress ? 'Check out' : 'Check in'} ${code}`}
            onClick={inProgress ? handleCheckOut : handleCheckIn}
            data-testid="card-primary-action"
          >
            {primaryLabel}
          </Button>
          {checkInDisabledFuture && (
            <span className="text-center text-xs text-muted-foreground">Available on inspection day</span>
          )}
        </div>
      )}

      <div className="relative">
        <Button
          variant="outlined"
          className="min-h-touch min-w-touch px-3"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`More actions for ${code}`}
          onClick={() => setMenuOpen((open) => !open)}
          data-testid="card-more-actions"
        >
          <MoreVertical className="h-5 w-5" aria-hidden="true" />
        </Button>

        {menuOpen && (
          <>
            {/* Backdrop closes the menu on an outside tap. */}
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="menu"
              aria-label={`Actions for ${code}`}
              className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-card border border-border bg-card shadow-lg"
            >
              {showRunningLate && (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-3 text-left text-sm text-foreground hover:bg-muted"
                  onClick={() => openSheet('late')}
                >
                  Running late
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className={cn(
                  'block w-full px-4 py-3 text-left text-sm font-semibold text-destructive hover:bg-muted',
                )}
                onClick={() => openSheet('cant-do')}
              >
                Can&apos;t do this job
              </button>
            </div>
          </>
        )}
      </div>

      {actions.confirmStep === 'SYNC' && (
        <SyncConfirmModal onConfirm={actions.confirmSync} onCancel={actions.cancelConfirm} />
      )}
      {actions.confirmStep === 'PAST_TIME' && (
        <PastTimeConfirmModal onConfirm={actions.confirmPastTime} onCancel={actions.cancelConfirm} />
      )}

      <CantDoSheet
        open={cantDoOpen}
        onOpenChange={setCantDoOpen}
        appointmentId={appointment.id}
        appointmentCode={code}
        propertyAddress={appointment.propertyAddress}
      />
      <LateNoticeSheet
        open={lateOpen}
        onOpenChange={setLateOpen}
        appointmentId={appointment.id}
        appointmentCode={code}
        propertyAddress={appointment.propertyAddress}
        timeSlotStart={appointment.timeSlotStart}
        publishedServiceStartAt={appointment.publishedServiceStartAt}
      />
    </div>
  );
}
