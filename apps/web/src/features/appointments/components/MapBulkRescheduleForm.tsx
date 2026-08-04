import { useMemo, useState } from 'react';
import { TimeRangeInput } from '@/components/forms/TimeRangeInput';
import { todayInTzDateString, currentTimeInTzHHmm, isTimeStartInPastForDate, ServiceGroupStatus } from '@properfy/shared';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { useBulkRescheduleAppointments } from '../hooks/useBulkRescheduleAppointments';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';
import { AppointmentCodePill } from './AppointmentCodePill';

/** The subset of a service group this form needs to preview its warnings. */
export interface RescheduleGroupContext {
  id: string;
  timeWindow: string;
  status: ServiceGroupStatus;
  code?: string;
}

interface MapBulkRescheduleFormProps {
  /** Rows the operator ticked in the bulk modal — drives the same-group precheck. */
  checkedAppointments: AppointmentMapItem[];
  /**
   * Groups already loaded by the page, used only to preview the window widening
   * and the accepted-group warning. Absent for CL_ADMIN (the groups list is an
   * AM/OP endpoint) — the form still submits, just without the preview.
   */
  serviceGroups?: RescheduleGroupContext[];
  onCancel: () => void;
  /** Result envelope is the same shape as 025 bulk actions; the modal renders the summary. */
  onComplete: (results: Array<{ appointmentId: string; status: string; error?: { code: string; message: string } }>) => void;
}

/**
 * Changes the time of the ticked appointments **without touching their status
 * or inspector**, via `POST /v1/appointments/bulk-reschedule` (delegates per
 * item to `UpdateAppointmentUseCase`).
 *
 * This replaces the previous wiring to `bulk-reopen-for-reschedule`, which was
 * an un-schedule in disguise: it hard-required SCHEDULED and wrote
 * `status: DRAFT` + `inspectorId: null`. Grouped appointments sit in
 * AWAITING_INSPECTOR, so every row failed the guard. That destructive path now
 * lives in `MapBulkReturnToPoolForm` under its own name.
 *
 * Only the time changes: the date is derived from the selection, since grouped
 * appointments follow the group date.
 */
export function MapBulkRescheduleForm({
  checkedAppointments,
  serviceGroups,
  onCancel: _onCancel,
  onComplete,
}: MapBulkRescheduleFormProps) {
  const [newTimeSlotStart, setNewTimeSlotStart] = useState('');
  const [newTimeSlotEnd, setNewTimeSlotEnd] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);

  // Date is kept from the selection (same-group ⇒ same group date); date-only normalization.
  const targetDate = (checkedAppointments[0]?.scheduledDate ?? '').split('T')[0] ?? '';

  // "Today" and the past-time hint follow the user's effective timezone.
  const effectiveTimezone = useEffectiveTimezone();
  const today = todayInTzDateString(effectiveTimezone);
  const minStartTime = targetDate === today ? currentTimeInTzHHmm(effectiveTimezone) : undefined;

  const sameGroupCheck = useMemo<{ ok: boolean; reason?: string }>(() => {
    if (checkedAppointments.length === 0) return { ok: false, reason: 'No appointments selected' };
    const groupIds = new Set(checkedAppointments.map((a) => a.serviceGroupId ?? null));
    if (groupIds.size > 1 || groupIds.has(null)) {
      return { ok: false, reason: 'Bulk reschedule limited to appointments within the same group in this cycle' };
    }
    // Appointments in a group share the group date; a mixed-date selection
    // means stale map data — refuse rather than pick one date arbitrarily.
    const dates = new Set(checkedAppointments.map((a) => (a.scheduledDate ?? '').split('T')[0]));
    if (dates.size > 1) {
      return { ok: false, reason: 'Selected appointments have different dates — refresh the map and try again' };
    }
    return { ok: true };
  }, [checkedAppointments]);

  const group = useMemo(() => {
    const groupId = checkedAppointments[0]?.serviceGroupId;
    if (!groupId) return null;
    return serviceGroups?.find((g) => g.id === groupId) ?? null;
  }, [checkedAppointments, serviceGroups]);

  /**
   * Preview of the widening the backend will perform. `HH:mm` is zero-padded
   * 24-hour, so lexicographic comparison is chronological — the same assumption
   * the ordered-range check below relies on. Display only; the server recomputes.
   */
  const windowExpansion = useMemo(() => {
    if (!group || !newTimeSlotStart || !newTimeSlotEnd) return null;
    const [groupStart, groupEnd] = group.timeWindow.split('-');
    if (!groupStart || !groupEnd) return null;
    if (newTimeSlotStart >= groupStart && newTimeSlotEnd <= groupEnd) return null;
    const start = newTimeSlotStart < groupStart ? newTimeSlotStart : groupStart;
    const end = newTimeSlotEnd > groupEnd ? newTimeSlotEnd : groupEnd;
    return { before: group.timeWindow, after: `${start}-${end}` };
  }, [group, newTimeSlotStart, newTimeSlotEnd]);

  // Tenants who confirmed the OLD time get a fresh INSPECTION_RESCHEDULED
  // notification (and a new portal token) from the backend — say so up front.
  const alreadyConfirmed = useMemo(
    () => checkedAppointments.filter((a) => a.rentalTenantConfirmationStatus === 'CONFIRMED'),
    [checkedAppointments],
  );

  const mutation = useBulkRescheduleAppointments();
  const timeRangeOrdered = newTimeSlotStart.length > 0 && newTimeSlotEnd.length > 0 && newTimeSlotStart < newTimeSlotEnd;
  const canSubmit = sameGroupCheck.ok && targetDate.length === 10 && timeRangeOrdered && !mutation.isPending;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        // Past-time guard (all roles) — native input min is only a hint.
        if (targetDate === today && isTimeStartInPastForDate(newTimeSlotStart, targetDate, effectiveTimezone)) {
          setTimeError('Start time is in the past');
          return;
        }
        setTimeError(null);
        const res = await mutation.mutateAsync({
          appointmentIds: checkedAppointments.map((a) => a.id),
          newDate: targetDate,
          newTimeSlotStart,
          newTimeSlotEnd,
          // The operator chose the time; the group's shared window follows.
          expandGroupTimeWindow: true,
        });
        onComplete(res.data.results);
      }}
      className="space-y-3"
      data-testid="map-bulk-reschedule-form"
    >
      <p className="text-xs text-text-secondary">
        Changes the time only. Status and assigned inspector are kept.
      </p>

      {!sameGroupCheck.ok && (
        <div
          className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800"
          data-testid="map-bulk-reschedule-scope-banner"
        >
          {sameGroupCheck.reason}
        </div>
      )}

      <label className="block text-sm font-medium text-text-primary">
        New time slot
        <div className="mt-1" data-testid="map-bulk-reschedule-slot-wrapper">
          <TimeRangeInput
            startTime={newTimeSlotStart}
            endTime={newTimeSlotEnd}
            onStartChange={(v) => { setNewTimeSlotStart(v); setTimeError(null); }}
            onEndChange={(v) => { setNewTimeSlotEnd(v); setTimeError(null); }}
            minStartTime={minStartTime}
            error={!!timeError}
            disabled={!sameGroupCheck.ok}
            idPrefix="map-bulk-reschedule-slot"
          />
        </div>
        {timeError && (
          <p className="mt-1 text-xs text-error" data-testid="map-bulk-reschedule-slot-error">
            {timeError}
          </p>
        )}
      </label>

      {/* These three banners appear as the operator edits the time inputs and
          describe side effects of submitting, so they announce themselves. */}
      {windowExpansion && (
        <div
          role="status"
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          data-testid="map-bulk-reschedule-window-warning"
        >
          The new time falls outside the group&apos;s window. Group{group?.code ? ` ${group.code}` : ''} window{' '}
          <strong>{windowExpansion.before}</strong> will widen to <strong>{windowExpansion.after}</strong>.
        </div>
      )}

      {windowExpansion && group?.status === ServiceGroupStatus.ACCEPTED && (
        <div
          role="status"
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          data-testid="map-bulk-reschedule-accepted-warning"
        >
          An inspector has already accepted this group under the current window. Widening it changes
          what they committed to.
        </div>
      )}

      {alreadyConfirmed.length > 0 && (
        <div
          role="status"
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          data-testid="map-bulk-reschedule-confirmed-warning"
        >
          <p className="mb-1">
            The tenant already confirmed the current time for
            {alreadyConfirmed.length === 1 ? ' this appointment' : ' these appointments'}. A new
            notification with the new time will be sent:
          </p>
          <ul className="flex flex-wrap gap-1">
            {alreadyConfirmed.map((a) => (
              <li key={a.id}>
                <AppointmentCodePill code={a.code} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          title={sameGroupCheck.reason}
          className="rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="map-bulk-reschedule-apply"
        >
          {mutation.isPending ? 'Rescheduling…' : `Apply reschedule (${checkedAppointments.length})`}
        </button>
      </div>
    </form>
  );
}
