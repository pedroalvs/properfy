import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PLATFORM_TIMEZONE, currentTimeInTzHHmm, todayInTzDateString } from '@properfy/shared';
import { Button } from '@/components/ui/Button';

interface StartInspectionButtonProps {
  appointmentId: string;
  scheduledDate: string;
  timeSlotStart: string;
  resume?: boolean;
}

const MINUTES_BEFORE = 30;
const HOURS_AFTER = 2;

function toMinutes(hhmm: string): number {
  const [hours = 0, minutes = 0] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

function getWindowState(scheduledDate: string, timeSlotStart: string): { enabled: boolean; label: string; sublabel?: string } {
  // All gating is anchored to Sydney civil time, never the device timezone.
  const today = todayInTzDateString(PLATFORM_TIMEZONE);
  const date = scheduledDate.slice(0, 10);

  // Past date: inspection window has passed, backend rejects past-date starts
  if (date < today) {
    return { enabled: false, label: 'Start Inspection', sublabel: 'Inspection window has passed' };
  }

  if (date > today) {
    // Future date
    return { enabled: false, label: 'Start Inspection', sublabel: 'Available on inspection day' };
  }

  // Same day: apply time-window logic in Sydney wall-clock minutes
  const nowMinutes = toMinutes(currentTimeInTzHHmm(PLATFORM_TIMEZONE));
  const startMinutes = toMinutes(timeSlotStart);
  const windowStart = startMinutes - MINUTES_BEFORE;
  const windowEnd = startMinutes + HOURS_AFTER * 60;

  if (nowMinutes < windowStart) {
    const diffMin = windowStart - nowMinutes;
    const timeLabel =
      diffMin > 60
        ? `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`
        : `${diffMin} min`;
    return { enabled: false, label: 'Start Inspection', sublabel: `Available in ${timeLabel}` };
  }

  if (nowMinutes > windowEnd) {
    return { enabled: false, label: 'Start Inspection', sublabel: 'Start window has passed' };
  }

  return { enabled: true, label: 'Start Inspection' };
}

export function StartInspectionButton({
  appointmentId,
  scheduledDate,
  timeSlotStart,
  resume = false,
}: StartInspectionButtonProps) {
  const navigate = useNavigate();
  const [windowState, setWindowState] = useState(() => getWindowState(scheduledDate, timeSlotStart));

  const updateState = useCallback(() => {
    setWindowState(getWindowState(scheduledDate, timeSlotStart));
  }, [scheduledDate, timeSlotStart]);

  useEffect(() => {
    if (resume) return;
    const interval = setInterval(updateState, 5_000);
    return () => clearInterval(interval);
  }, [resume, updateState]);

  const { enabled, label, sublabel } = resume
    ? { enabled: true, label: 'Resume Inspection', sublabel: 'Continue where you left off' }
    : windowState;

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="primary"
        disabled={!enabled}
        onClick={() => navigate(`/execution/${appointmentId}`)}
        className={`!w-full !min-h-[56px] !rounded-2xl !text-base !font-bold ${resume ? '!bg-warning' : ''}`}
        data-testid="start-inspection-button"
      >
        <i
          className={`mdi ${resume ? 'mdi-play-circle' : 'mdi-play-circle-outline'} text-xl`}
          aria-hidden="true"
        />
        {label}
      </Button>
      {sublabel && (
        <p className="text-center text-xs text-text-muted" data-testid="start-inspection-sublabel">{sublabel}</p>
      )}
    </div>
  );
}
