import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { getScheduleStartDateTime } from '../lib/time-slot';

interface StartInspectionButtonProps {
  appointmentId: string;
  scheduledDate: string;
  timeSlot: string;
}

const MINUTES_BEFORE = 30;
const HOURS_AFTER = 2;

function getWindowState(scheduledDate: string, timeSlot: string): { enabled: boolean; label: string } {
  const now = new Date();
  const start = getScheduleStartDateTime(scheduledDate, timeSlot);
  const today = new Date();

  const isSameDay =
    start.getDate() === today.getDate() &&
    start.getMonth() === today.getMonth() &&
    start.getFullYear() === today.getFullYear();

  if (!isSameDay) {
    return { enabled: false, label: 'Available on inspection day' };
  }

  const windowStart = new Date(start.getTime() - MINUTES_BEFORE * 60 * 1000);
  const windowEnd = new Date(start.getTime() + HOURS_AFTER * 60 * 60 * 1000);

  if (now < windowStart) {
    const diffMs = windowStart.getTime() - now.getTime();
    const diffMin = Math.ceil(diffMs / 60000);
    if (diffMin > 60) {
      const hours = Math.floor(diffMin / 60);
      return { enabled: false, label: `Available in ${hours}h ${diffMin % 60}min` };
    }
    return { enabled: false, label: `Available in ${diffMin} min` };
  }

  if (now > windowEnd) {
    return { enabled: false, label: 'Start window has passed' };
  }

  return { enabled: true, label: 'Start Inspection' };
}

export function StartInspectionButton({
  appointmentId,
  scheduledDate,
  timeSlot,
}: StartInspectionButtonProps) {
  const navigate = useNavigate();
  const [state, setState] = useState(() => getWindowState(scheduledDate, timeSlot));

  const updateState = useCallback(() => {
    setState(getWindowState(scheduledDate, timeSlot));
  }, [scheduledDate, timeSlot]);

  useEffect(() => {
    const interval = setInterval(updateState, 30_000);
    return () => clearInterval(interval);
  }, [updateState]);

  return (
    <Button
      variant="primary"
      disabled={!state.enabled}
      onClick={() => navigate(`/execution/${appointmentId}`)}
      className="!w-full !min-h-[48px]"
      data-testid="start-inspection-button"
    >
      <i className="mdi mdi-play-circle-outline text-lg" aria-hidden="true" />
      {state.label}
    </Button>
  );
}
