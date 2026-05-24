import { useMemo, useState } from 'react';
import { SelectInput } from '@/components/forms/SelectInput';
import { useTimeSlotOptions } from '../hooks/useTimeSlotOptions';
import { todayLocalDateString, isTimeStartInPastForDate } from '@properfy/shared';
import { useBulkReopenForReschedule } from '../hooks/useBulkReopenForReschedule';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

interface MapBulkRescheduleFormProps {
  /** Rows the operator ticked in the bulk modal — drives the same-group precheck. */
  checkedAppointments: AppointmentMapItem[];
  /** Browser timezone forwarded for per-day idempotency bucketing. */
  actorTimezone?: string;
  onCancel: () => void;
  /** Result envelope is the same shape as 025 bulk actions; the modal renders the summary. */
  onComplete: (results: Array<{ appointmentId: string; status: string; error?: { code: string; message: string } }>) => void;
}

/**
 * 026 §FR-540..545 — Bulk reschedule form for the map flow.
 *
 * Key Regras invariants enforced here:
 *  - Time-slot value is sourced from `useTimeSlotOptions(branchId, tenantId)`
 *    — the effective slot catalog. The previous free-text input is
 *    intentionally REMOVED per the Regras matrix (mockup diverges; Regras
 *    prevails).
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
  actorTimezone,
  onCancel: _onCancel,
  onComplete,
}: MapBulkRescheduleFormProps) {
  const [newDate, setNewDate] = useState('');
  const [newTimeSlot, setNewTimeSlot] = useState('');
  const [reason, setReason] = useState('');

  // All checked appointments belong to the same group (precheck enforces it)
  // so they share the same branchId — read the first row.
  // C11-T4: branchId is now populated in AppointmentMapItem so the slot catalog
  // is fetched for the correct branch.
  const branchId = checkedAppointments[0]?.branchId;
  const { options: rawSlotOptions = [] } = useTimeSlotOptions(branchId);
  const today = todayLocalDateString();
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Filter out past time slots when date = today (Layer 4c).
  const slotOptions = useMemo(() => {
    if (newDate !== today) return rawSlotOptions;
    return rawSlotOptions.filter((opt) => !isTimeStartInPastForDate(opt.value, newDate, browserTz));
  }, [rawSlotOptions, newDate, today, browserTz]);

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
  const canSubmit = sameGroupCheck.ok && newDate.length === 10 && newTimeSlot.length > 0 && !mutation.isPending;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const trimmedReason = reason.trim();
        const res = await mutation.mutateAsync({
          appointmentIds: checkedAppointments.map((a) => a.id),
          newDate,
          newTimeSlot,
          ...(trimmedReason.length >= 3 ? { reason: trimmedReason } : {}),
          ...(actorTimezone ? { actorTimezone } : {}),
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
          <SelectInput
            value={newTimeSlot}
            onChange={setNewTimeSlot}
            options={slotOptions}
            placeholder="Select a time slot…"
            disabled={!sameGroupCheck.ok}
            aria-label="New time slot"
          />
        </div>
        {slotOptions.length === 0 && sameGroupCheck.ok && (
          <p className="mt-1 text-xs text-text-muted">
            No effective time slots available for this branch. Configure slots before rescheduling.
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
