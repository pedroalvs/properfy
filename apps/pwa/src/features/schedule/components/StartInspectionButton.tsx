import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { getScheduleStartDateTime } from '../lib/time-slot';

interface StartInspectionButtonProps {
  appointmentId: string;
  scheduledDate: string;
  timeSlotStart: string;
  resume?: boolean;
}

const MINUTES_BEFORE = 30;
const HOURS_AFTER = 2;

function getWindowState(scheduledDate: string, timeSlotStart: string): { enabled: boolean; label: string; sublabel?: string } {
  const now = new Date();
  const start = getScheduleStartDateTime(scheduledDate, timeSlotStart);
  const today = new Date();

  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  // Past date: inspection window has passed, backend rejects past-date starts
  if (startMidnight < todayMidnight) {
    return { enabled: false, label: 'Start Inspection', sublabel: 'Inspection window has passed' };
  }

  const isSameDay = startMidnight.getTime() === todayMidnight.getTime();

  if (!isSameDay) {
    // Future date
    return { enabled: false, label: 'Start Inspection', sublabel: 'Available on inspection day' };
  }

  // Same day: apply time-window logic
  const windowStart = new Date(start.getTime() - MINUTES_BEFORE * 60 * 1000);
  const windowEnd = new Date(start.getTime() + HOURS_AFTER * 60 * 60 * 1000);

  if (now < windowStart) {
    const diffMs = windowStart.getTime() - now.getTime();
    const diffMin = Math.ceil(diffMs / 60000);
    const timeLabel =
      diffMin > 60
        ? `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`
        : `${diffMin} min`;
    return { enabled: false, label: 'Start Inspection', sublabel: `Available in ${timeLabel}` };
  }

  if (now > windowEnd) {
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
