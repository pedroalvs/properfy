import { useMemo, useState } from 'react';
import { TimeRangeInput } from '@/components/forms/TimeRangeInput';
import { PLATFORM_TIMEZONE, todayInTzDateString, currentTimeInTzHHmm, isTimeStartInPastForDate } from '@properfy/shared';
import { useBulkReopenForReschedule } from '../hooks/useBulkReopenForReschedule';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';
import { AppointmentCodePill } from './AppointmentCodePill';

interface MapBulkReturnToPoolFormProps {
  /** Rows the operator ticked in the bulk modal — drives the same-group precheck. */
  checkedAppointments: AppointmentMapItem[];
  onCancel: () => void;
  /** Result envelope is the same shape as 025 bulk actions; the modal renders the summary. */
  onComplete: (results: Array<{ appointmentId: string; status: string; error?: { code: string; message: string } }>) => void;
}

/**
 * Returns SCHEDULED appointments to the marketplace pool: `SCHEDULED → DRAFT`
 * with the inspector cleared and portal tokens revoked, via
 * `POST /v1/appointments/bulk-reopen-for-reschedule`.
 *
 * This is the behaviour that used to sit behind the "Reschedule" label. It was
 * the wrong default — an operator adjusting a time does not want to lose the
 * inspector — so plain time edits now go through `MapBulkRescheduleForm` and
 * this stays as its own explicitly-named, destructive action.
 *
 * `ReopenForRescheduleUseCase` hard-requires SCHEDULED, so the offending rows
 * are named up front instead of coming back as a per-item error after submit.
 */
export function MapBulkReturnToPoolForm({
  checkedAppointments,
  onCancel: _onCancel,
  onComplete,
}: MapBulkReturnToPoolFormProps) {
  const [newTimeSlotStart, setNewTimeSlotStart] = useState('');
  const [newTimeSlotEnd, setNewTimeSlotEnd] = useState('');
  const [reason, setReason] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);

  // Date is kept from the selection (same-group ⇒ same group date); date-only normalization.
  const targetDate = (checkedAppointments[0]?.scheduledDate ?? '').split('T')[0] ?? '';

  // Sydney-only platform: "today" and the past-time hint follow the platform timezone.
  const today = todayInTzDateString(PLATFORM_TIMEZONE);
  const minStartTime = targetDate === today ? currentTimeInTzHHmm(PLATFORM_TIMEZONE) : undefined;

  // Same-group precheck — disable submit when the selection spans
  // groups or contains a non-grouped item.
  const sameGroupCheck = useMemo<{ ok: boolean; reason?: string }>(() => {
    if (checkedAppointments.length === 0) return { ok: false, reason: 'No appointments selected' };
    const groupIds = new Set(checkedAppointments.map((a) => a.serviceGroupId ?? null));
    if (groupIds.size > 1 || groupIds.has(null)) {
      return { ok: false, reason: 'Limited to appointments within the same group in this cycle' };
    }
    // Appointments in a group share the group date; a mixed-date selection
    // means stale map data — refuse rather than pick one date arbitrarily.
    const dates = new Set(checkedAppointments.map((a) => (a.scheduledDate ?? '').split('T')[0]));
    if (dates.size > 1) {
      return { ok: false, reason: 'Selected appointments have different dates — refresh the map and try again' };
    }
    return { ok: true };
  }, [checkedAppointments]);

  // Only SCHEDULED appointments can be returned to the pool — everything else
  // is already in it (or terminal). Surfaced before submit; the backend keeps
  // its own guard.
  const notScheduled = useMemo(
    () => checkedAppointments.filter((a) => a.status !== 'SCHEDULED'),
    [checkedAppointments],
  );

  const mutation = useBulkReopenForReschedule();
  const timeRangeOrdered = newTimeSlotStart.length > 0 && newTimeSlotEnd.length > 0 && newTimeSlotStart < newTimeSlotEnd;
  const canSubmit =
    sameGroupCheck.ok && notScheduled.length === 0 && targetDate.length === 10 && timeRangeOrdered && !mutation.isPending;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        // Past-time guard (all roles) — native input min is only a hint.
        if (targetDate === today && isTimeStartInPastForDate(newTimeSlotStart, targetDate, PLATFORM_TIMEZONE)) {
          setTimeError('Start time is in the past');
          return;
        }
        setTimeError(null);
        const trimmedReason = reason.trim();
        const res = await mutation.mutateAsync({
          appointmentIds: checkedAppointments.map((a) => a.id),
          newDate: targetDate,
          newTimeSlotStart,
          newTimeSlotEnd,
          ...(trimmedReason.length >= 3 ? { reason: trimmedReason } : {}),
        });
        onComplete(res.data.results);
      }}
      className="space-y-3"
      data-testid="map-bulk-return-to-pool-form"
    >
      <p
        className="rounded border border-border-subtle bg-gray-50 px-3 py-2 text-xs text-text-secondary"
        data-testid="map-bulk-return-to-pool-effect"
      >
        This moves the appointments back to <strong>Draft</strong> and unassigns the inspector, so
        the group can be offered again. To change only the time and keep the inspector, use
        <strong> Reschedule</strong> instead.
      </p>

      {!sameGroupCheck.ok && (
        <div
          className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800"
          data-testid="map-bulk-return-to-pool-scope-banner"
        >
          {sameGroupCheck.reason}
        </div>
      )}

      {notScheduled.length > 0 && (
        <div
          className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800"
          data-testid="map-bulk-return-to-pool-status-warning"
        >
          <p className="mb-1">
            Only <strong>Scheduled</strong> appointments can be returned to the pool. Untick these
            {notScheduled.length === 1 ? ' row' : ' rows'} to continue:
          </p>
          <ul className="flex flex-wrap gap-1">
            {notScheduled.map((a) => (
              <li key={a.id}>
                <AppointmentCodePill code={a.code} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="block text-sm font-medium text-text-primary">
        New time slot
        <div className="mt-1" data-testid="map-bulk-return-to-pool-slot-wrapper">
          <TimeRangeInput
            startTime={newTimeSlotStart}
            endTime={newTimeSlotEnd}
            onStartChange={(v) => { setNewTimeSlotStart(v); setTimeError(null); }}
            onEndChange={(v) => { setNewTimeSlotEnd(v); setTimeError(null); }}
            minStartTime={minStartTime}
            error={!!timeError}
            disabled={!sameGroupCheck.ok}
            idPrefix="map-bulk-return-to-pool-slot"
          />
        </div>
        {timeError && (
          <p className="mt-1 text-xs text-error" data-testid="map-bulk-return-to-pool-slot-error">
            {timeError}
          </p>
        )}
      </label>

      <label className="block text-sm font-medium text-text-primary">
        Reason (optional)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          maxLength={500}
          rows={2}
          disabled={!sameGroupCheck.ok}
          placeholder="Why are these appointments going back to the pool?"
          className="mt-1 block w-full rounded border border-border-subtle p-2 text-sm disabled:bg-gray-50"
          data-testid="map-bulk-return-to-pool-reason"
        />
      </label>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          title={sameGroupCheck.reason}
          className="rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="map-bulk-return-to-pool-apply"
        >
          {mutation.isPending ? 'Returning…' : `Return to pool (${checkedAppointments.length})`}
        </button>
      </div>
    </form>
  );
}
