import { useEffect, useMemo, useState } from 'react';
import {
  currentTimeInTzHHmm,
  todayInTzDateString,
  isTimeStartInPastForDate,
  PLATFORM_TIMEZONE,
  ServiceGroupStatus,
  isTerminalAppointmentStatus,
  type GroupConfirmationStrategy,
} from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { TimeWindowPicker } from './TimeWindowPicker';
import { AppointmentCodePill } from '@/features/appointments/components/AppointmentCodePill';
import { useRescheduleServiceGroup } from '../hooks/useRescheduleServiceGroup';
import type { ServiceGroupDetail } from '../types';

interface RescheduleGroupModalProps {
  open: boolean;
  onClose: () => void;
  serviceGroup: ServiceGroupDetail;
  /** Entry point. Only picks the title and intro copy — both fields stay editable. */
  mode: 'date' | 'time-window';
  onSaved: () => void;
}

const splitWindow = (timeWindow: string | null): [string, string] => {
  const [start, end] = (timeWindow ?? '').split('-');
  return [start ?? '', end ?? ''];
};

/**
 * Moves a group's date and/or time window.
 *
 * Both fields are always editable regardless of which menu item opened the
 * modal, because the two interact: previewing them separately is the one way
 * "the operator changed both at once" could slip through unreviewed.
 *
 * The impact preview is computed here and is display-only — the server recomputes
 * against fresh rows and the response reports what it actually applied. `HH:mm`
 * is zero-padded, so lexicographic comparison is chronological, the same
 * assumption the backend's own parser relies on.
 */
export function RescheduleGroupModal({
  open,
  onClose,
  serviceGroup,
  mode,
  onSaved,
}: RescheduleGroupModalProps) {
  const currentDate = serviceGroup.scheduledDate?.slice(0, 10) ?? '';
  const [currentStart, currentEnd] = splitWindow(serviceGroup.timeWindow);

  const [scheduledDate, setScheduledDate] = useState(currentDate);
  const [startTime, setStartTime] = useState(currentStart);
  const [endTime, setEndTime] = useState(currentEnd);
  const [confirmationStrategy, setConfirmationStrategy] = useState<GroupConfirmationStrategy | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefilled, unlike EditGroupModal's blank change-only fields: you cannot
  // judge a clamp against a window you cannot see.
  useEffect(() => {
    if (!open) return;
    setScheduledDate(currentDate);
    setStartTime(currentStart);
    setEndTime(currentEnd);
    setConfirmationStrategy(null);
    setError(null);
  }, [open, currentDate, currentStart, currentEnd]);

  const today = todayInTzDateString(PLATFORM_TIMEZONE);
  const newWindow = startTime && endTime ? `${startTime}-${endTime}` : '';
  const dateChanged = scheduledDate !== '' && scheduledDate !== currentDate;
  const windowChanged = newWindow !== '' && newWindow !== serviceGroup.timeWindow;

  const appointments = useMemo(
    // Settled members do not move with the group, so the preview must not
    // promise otherwise. Same predicate the backend cascade uses.
    () => (serviceGroup.appointments ?? []).filter((a) => !isTerminalAppointmentStatus(a.status)),
    [serviceGroup.appointments],
  );

  /** Members whose slot leaves the new window and will be clamped into it. */
  const clamped = useMemo(() => {
    if (!windowChanged) return [];
    return appointments.filter(
      (a) => a.timeSlotStart && a.timeSlotEnd && (a.timeSlotStart < startTime || a.timeSlotEnd > endTime),
    );
  }, [appointments, windowChanged, startTime, endTime]);

  /** Tenants who confirmed the schedule that is about to move. */
  const alreadyConfirmed = useMemo(() => {
    if (!dateChanged && !windowChanged) return [];
    const affectedIds = new Set(dateChanged ? appointments.map((a) => a.id) : clamped.map((a) => a.id));
    return appointments.filter(
      (a) => affectedIds.has(a.id) && a.rentalTenantConfirmationStatus === 'CONFIRMED',
    );
  }, [appointments, dateChanged, windowChanged, clamped]);

  const requiresConfirmationChoice =
    alreadyConfirmed.length > 0 && serviceGroup.status !== ServiceGroupStatus.DRAFT;

  const { reschedule, isRescheduling } = useRescheduleServiceGroup(serviceGroup.id, () => {
    onSaved();
    onClose();
  });

  const timeRangeOrdered = startTime !== '' && endTime !== '' && startTime < endTime;
  const canSubmit =
    (dateChanged || windowChanged) &&
    timeRangeOrdered &&
    !isRescheduling &&
    (!requiresConfirmationChoice || confirmationStrategy !== null);

  const handleSubmit = () => {
    if (!canSubmit) return;
    // Native input `min` is only a hint; guard the past explicitly.
    const targetDate = scheduledDate || currentDate;
    if (targetDate === today && isTimeStartInPastForDate(startTime, targetDate, PLATFORM_TIMEZONE)) {
      setError('Start time is in the past');
      return;
    }
    setError(null);
    reschedule({
      ...(dateChanged ? { scheduledDate } : {}),
      ...(windowChanged ? { timeWindow: newWindow } : {}),
      // Nothing to decide when no confirmation is at stake; the API still
      // requires the field, so send the non-destructive option.
      confirmationStrategy: requiresConfirmationChoice ? confirmationStrategy! : 'NOTIFY_ONLY',
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'date' ? 'Change date' : 'Change time window'}
      maxWidth="600px"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            {isRescheduling ? 'Applying…' : 'Apply changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-text-secondary">
          Appointments in this group follow its schedule. Changing the date moves them all;
          changing the window pulls any appointment outside it back in.
        </p>

        <FormField label="Scheduled Date">
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            min={today}
            className="w-full rounded border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            aria-label="Scheduled date"
          />
        </FormField>

        <FormField label="Time Window">
          <TimeWindowPicker
            startTime={startTime}
            endTime={endTime}
            onStartTimeChange={setStartTime}
            onEndTimeChange={setEndTime}
            minStartTime={scheduledDate === today ? currentTimeInTzHHmm(PLATFORM_TIMEZONE) : undefined}
          />
        </FormField>

        {error && (
          <p className="text-xs text-error" data-testid="reschedule-group-error">
            {error}
          </p>
        )}

        {/* These banners appear as the operator edits and describe what
            submitting will do, so they announce themselves. */}
        {dateChanged && appointments.length > 0 && (
          <div
            role="status"
            className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            data-testid="reschedule-group-date-warning"
          >
            {appointments.length} appointment(s) will be moved to <strong>{scheduledDate}</strong>.
            {!windowChanged && ' Time slots are unchanged.'}
          </div>
        )}

        {windowChanged && clamped.length > 0 && (
          <div
            role="status"
            className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            data-testid="reschedule-group-clamp-warning"
          >
            <p className="mb-1">
              These appointments fall outside the new window and will be moved to{' '}
              <strong>{startTime}–{endTime}</strong>:
            </p>
            <ul className="flex flex-col gap-0.5">
              {clamped.map((a) => (
                <li key={a.id}>
                  <AppointmentCodePill code={a.propertyCode ?? `#${a.appointmentNumber}`} />{' '}
                  {a.timeSlotStart}–{a.timeSlotEnd} → {startTime}–{endTime}
                </li>
              ))}
            </ul>
            {appointments.length > clamped.length && (
              <p className="mt-1">
                {appointments.length - clamped.length} appointment(s) are already inside the new
                window and will not change.
              </p>
            )}
          </div>
        )}

        {windowChanged && clamped.length === 0 && (
          <div
            role="status"
            className="rounded border border-black/10 bg-black/[0.03] px-3 py-2 text-xs text-text-secondary"
            data-testid="reschedule-group-no-clamp"
          >
            Every appointment already fits inside the new window — no time slots will change.
          </div>
        )}

        {requiresConfirmationChoice && (
          <fieldset
            className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            data-testid="reschedule-group-confirmation-choice"
          >
            <legend className="px-1 font-semibold">Tenant confirmations</legend>
            <p className="mb-2">
              The tenant already confirmed the current schedule for:{' '}
              {alreadyConfirmed.map((a) => (
                <AppointmentCodePill key={a.id} code={a.propertyCode ?? `#${a.appointmentNumber}`} />
              ))}
            </p>
            <label className="flex items-start gap-2 py-1">
              <input
                type="radio"
                name="confirmationStrategy"
                className="mt-0.5 accent-primary"
                checked={confirmationStrategy === 'RESEND'}
                onChange={() => setConfirmationStrategy('RESEND')}
              />
              <span>
                <strong>Resend confirmation</strong> — these go back to Pending and the tenant gets
                a new confirmation link.
              </span>
            </label>
            <label className="flex items-start gap-2 py-1">
              <input
                type="radio"
                name="confirmationStrategy"
                className="mt-0.5 accent-primary"
                checked={confirmationStrategy === 'NOTIFY_ONLY'}
                onChange={() => setConfirmationStrategy('NOTIFY_ONLY')}
              />
              <span>
                <strong>Notify only</strong> — the existing confirmation is kept and the tenant is
                told the new time.
              </span>
            </label>
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}
