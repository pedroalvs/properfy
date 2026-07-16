import { useMemo, useState } from 'react';
import { TimeRangeInput } from '@/components/forms/TimeRangeInput';
import { PLATFORM_TIMEZONE, todayInTzDateString, currentTimeInTzHHmm, isTimeStartInPastForDate } from '@properfy/shared';
import { useBulkReopenForReschedule } from '../hooks/useBulkReopenForReschedule';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

interface MapBulkRescheduleFormProps {
  /** Rows the operator ticked in the bulk modal — drives the same-group precheck. */
  checkedAppointments: AppointmentMapItem[];
  onCancel: () => void;
  /** Result envelope is the same shape as 025 bulk actions; the modal renders the summary. */
  onComplete: (results: Array<{ appointmentId: string; status: string; error?: { code: string; message: string } }>) => void;
}

/**
 * 026 §FR-540..545 — Bulk reschedule form for the map flow.
 *
 * Key Regras invariants enforced here:
 *  - Time window is a free start/end time range (`newTimeSlotStart` /
 *    `newTimeSlotEnd`), entered via the shared `TimeRangeInput`.
 *  - Same-group only. The submit button is disabled when the selection
 *    spans groups or contains non-grouped items; the tooltip explains
 *    the limitation. Backend ALSO returns INVALID_SCOPE in that case
 *    (defence in depth).
 *  - Posts to `POST /v1/appointments/bulk-reopen-for-reschedule`, which
 *    delegates per-item to `ReopenForRescheduleUseCase` (also revokes
 *    active portal tokens since 026 §FR-543).
 */
export function MapBulkRescheduleForm({
  checkedAppointments,
  onCancel: _onCancel,
  onComplete,
}: MapBulkRescheduleFormProps) {
  const [newDate, setNewDate] = useState('');
  const [newTimeSlotStart, setNewTimeSlotStart] = useState('');
  const [newTimeSlotEnd, setNewTimeSlotEnd] = useState('');
  const [reason, setReason] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);

  // Sydney-only platform: "today" and the past-time hint follow the platform timezone.
  const today = todayInTzDateString(PLATFORM_TIMEZONE);
  // UX hint: when rescheduling to today, discourage picking a past start time.
  const minStartTime = newDate === today ? currentTimeInTzHHmm(PLATFORM_TIMEZONE) : undefined;

  // Same-group precheck — disable submit when the selection spans
  // groups or contains a non-grouped item.
  const sameGroupCheck = useMemo<{ ok: boolean; reason?: string }>(() => {
    if (checkedAppointments.length === 0) return { ok: false, reason: 'No appointments selected' };
    const groupIds = new Set(checkedAppointments.map((a) => a.serviceGroupId ?? null));
    if (groupIds.size > 1 || groupIds.has(null)) {
      return { ok: false, reason: 'Bulk reschedule limited to appointments within the same group in this cycle' };
    }
    return { ok: true };
  }, [checkedAppointments]);

  const mutation = useBulkReopenForReschedule();
  const timeRangeOrdered = newTimeSlotStart.length > 0 && newTimeSlotEnd.length > 0 && newTimeSlotStart < newTimeSlotEnd;
  const canSubmit = sameGroupCheck.ok && newDate.length === 10 && timeRangeOrdered && !mutation.isPending;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        // Past-time guard (all roles) — native input min is only a hint.
        if (newDate === today && isTimeStartInPastForDate(newTimeSlotStart, newDate, PLATFORM_TIMEZONE)) {
          setTimeError('Start time is in the past');
          return;
        }
        setTimeError(null);
        const trimmedReason = reason.trim();
        const res = await mutation.mutateAsync({
          appointmentIds: checkedAppointments.map((a) => a.id),
          newDate,
          newTimeSlotStart,
          newTimeSlotEnd,
          ...(trimmedReason.length >= 3 ? { reason: trimmedReason } : {}),
        });
        onComplete(res.data.results);
      }}
      className="space-y-3"
      data-testid="map-bulk-reschedule-form"
    >
      {!sameGroupCheck.ok && (
        <div
          className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800"
          data-testid="map-bulk-reschedule-scope-banner"
        >
          {sameGroupCheck.reason}
        </div>
      )}

      <label className="block text-sm font-medium text-text-primary">
        New date
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          required
          min={today}
          disabled={!sameGroupCheck.ok}
          className="mt-1 block w-full rounded border border-border-subtle p-2 text-sm disabled:bg-gray-50"
          data-testid="map-bulk-reschedule-date"
        />
      </label>

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

      <label className="block text-sm font-medium text-text-primary">
        Reason (optional)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          maxLength={500}
          rows={2}
          disabled={!sameGroupCheck.ok}
          placeholder="Why are you rescheduling these appointments?"
          className="mt-1 block w-full rounded border border-border-subtle p-2 text-sm disabled:bg-gray-50"
          data-testid="map-bulk-reschedule-reason"
        />
      </label>

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
