import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { todayInTzDateString } from '@properfy/shared';
import { Button } from '@/components/ui/Button';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';

interface StartInspectionButtonProps {
  appointmentId: string;
  scheduledDate: string;
  resume?: boolean;
}

/**
 * The inspection day is open from midnight to midnight, and stays open after it:
 * a job that slipped past its date is still a job to do, so only a date that has
 * not arrived yet blocks the start. The time slot is an expectation shown to the
 * inspector, not a gate.
 */
function getGateState(scheduledDate: string, timeZone: string): { enabled: boolean; label: string; sublabel?: string } {
  // Anchored to the inspector's effective timezone, never the device timezone.
  // This client-side gate is advisory only — the authoritative "can start"
  // check runs server-side in the appointment's agency timezone.
  const today = todayInTzDateString(timeZone);
  const date = scheduledDate.slice(0, 10);

  if (date > today) {
    return { enabled: false, label: 'Start Inspection', sublabel: 'Available on inspection day' };
  }

  return { enabled: true, label: 'Start Inspection' };
}

export function StartInspectionButton({
  appointmentId,
  scheduledDate,
  resume = false,
}: StartInspectionButtonProps) {
  const navigate = useNavigate();
  const timeZone = useEffectiveTimezone();
  const [gateState, setGateState] = useState(() => getGateState(scheduledDate, timeZone));

  const updateState = useCallback(() => {
    setGateState(getGateState(scheduledDate, timeZone));
  }, [scheduledDate, timeZone]);

  // Keeps the button in sync so it opens at the timezone's midnight without a refresh.
  useEffect(() => {
    if (resume) return;
    const interval = setInterval(updateState, 5_000);
    return () => clearInterval(interval);
  }, [resume, updateState]);

  const { enabled, label, sublabel } = resume
    ? { enabled: true, label: 'Resume Inspection', sublabel: 'Continue where you left off' }
    : gateState;

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
