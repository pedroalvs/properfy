import { useEffect, useRef, useState } from 'react';
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
import type { InspectorAppointmentDetailResponse } from '@/features/schedule/types';

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

/**
 * The minimum an execution target needs for the Check in/out + "More actions"
 * bar. Deliberately not the full appointment or day-plan stop: the bar derives
 * its phase from `useExecutionActions` (local IndexedDB state), never a server
 * status, so only identity, the service date/window (late-notice + past-end
 * gate) and the address (can't-do sheet) are required. `stopToActionTarget`
 * (day-plan) and `appointmentToActionTarget` (schedule) build it.
 */
export interface ExecutionActionTarget {
  id: string;
  appointmentCode: string;
  scheduledDate: string;
  propertyAddress: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  publishedServiceStartAt?: string | null;
}

export function appointmentToActionTarget(appointment: {
  id: string;
  appointmentCode: string;
  scheduledDate: string;
  propertyAddress: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  publishedServiceStartAt?: string | null;
}): ExecutionActionTarget {
  return {
    id: appointment.id,
    appointmentCode: appointment.appointmentCode,
    scheduledDate: appointment.scheduledDate,
    propertyAddress: appointment.propertyAddress,
    timeSlotStart: appointment.timeSlotStart,
    timeSlotEnd: appointment.timeSlotEnd,
    publishedServiceStartAt: appointment.publishedServiceStartAt,
  };
}

interface AppointmentActionBarProps {
  target: ExecutionActionTarget;
  /** Whether the target is dated today (gate for Check in / Running late). */
  isToday: boolean;
}

/**
 * Check in / Check out primary button + "More actions" menu (Running late /
 * Can't do this job), extracted from the schedule card so the Today screen's
 * Next-inspection card reuses the exact F03-3 behaviour. Renders no wrapper
 * `<article>`/`<button>`; the host provides the row container.
 */
export function AppointmentActionBar({ target, isToday }: AppointmentActionBarProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timeZone = useEffectiveTimezone();
  const isOnline = useIsOnline();
  const { showSuccess, showError, showInfo } = useSnackbar();
  const actions = useExecutionActions(target.id);
  const [busy, setBusy] = useState<Busy>('idle');
  const [menuOpen, setMenuOpen] = useState(false);
  const [cantDoOpen, setCantDoOpen] = useState(false);
  const [lateOpen, setLateOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const phase = actions.state.phase;
  const inProgress = actions.isRestored && IN_PROGRESS_PHASES.includes(phase);
  const isDone = phase === 'DONE';
  const code = target.appointmentCode;
  const pastEnd = isPastScheduledEnd(target.scheduledDate, target.timeSlotEnd, timeZone);
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
        queryKey: ['inspector', 'appointment', target.id],
        queryFn: () =>
          apiGet<{ data: InspectorAppointmentDetailResponse['data'] }>(
            `/v1/inspector/appointments/${target.id}`,
          ),
        staleTime: 30_000,
      });
      hasInspectionAppLink = Boolean(detail?.data?.jobDetails?.inspectionAppLink);
    } catch {
      setBusy('idle');
      navigate(`/execution/${target.id}`);
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

      <div className="relative" ref={menuRef}>
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
        appointmentId={target.id}
        appointmentCode={code}
        propertyAddress={target.propertyAddress}
      />
      <LateNoticeSheet
        open={lateOpen}
        onOpenChange={setLateOpen}
        appointmentId={target.id}
        appointmentCode={code}
        propertyAddress={target.propertyAddress}
        timeSlotStart={target.timeSlotStart}
        publishedServiceStartAt={target.publishedServiceStartAt}
      />
    </div>
  );
}
