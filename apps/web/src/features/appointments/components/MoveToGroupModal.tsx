import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { SelectInput } from '@/components/forms/SelectInput';
import { useFindMoveTargetGroups } from '../hooks/useFindMoveTargetGroups';
import { useMoveAppointmentsToGroup } from '../hooks/useMoveAppointmentsToGroup';
import { useSnackbar } from '@/hooks/useSnackbar';
import { AppointmentCodePill } from './AppointmentCodePill';
import type { MoveTargetGroupSummary, MoveToGroupResultItem } from '@properfy/shared';
import { formatCivilDate, formatWallTimeWindow } from '@/lib/format-date';

function formatGroupDate(scheduledDate: string): string {
  return formatCivilDate(scheduledDate.slice(0, 10));
}

/** The minimal appointment shape the modal needs across all four surfaces. */
export interface MoveToGroupAppointment {
  id: string;
  /** Display code (appointment number); falls back to the id. */
  code?: string;
  /** Civil date (YYYY-MM-DD or ISO) used for the date-sync banner. */
  scheduledDate?: string;
}

interface MoveToGroupModalProps {
  open: boolean;
  onClose: () => void;
  /** The appointments to move — must already be in a live group (backend enforces). */
  appointments: MoveToGroupAppointment[];
  /**
   * Called whenever a move changed data (including a partial success), so the caller
   * can refetch. It must NOT close the modal — the modal closes itself via `onClose`
   * on a full success, and stays open on a partial failure so the per-item errors
   * remain visible.
   */
  onSuccess?: () => void;
}

type GroupsState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; groups: MoveTargetGroupSummary[]; reason?: 'MIXED_APPOINTMENT_PROPERTIES' | 'INVALID_APPOINTMENT_STATUS' | 'NOT_GROUPED' }
  | { phase: 'error' };

type MoveResultState = null | { results: MoveToGroupResultItem[] };

/**
 * Move-to-group modal — move appointments already in a live group to a different
 * active group. Two steps: (1) pick a destination from the pre-filtered list; (2)
 * confirm. A current-day destination warns that the tenant is treated as already
 * confirmed; a different-date destination warns that the appointments are
 * re-scheduled to the group's date.
 */
export function MoveToGroupModal({ open, onClose, appointments, onSuccess }: MoveToGroupModalProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupsState, setGroupsState] = useState<GroupsState>({ phase: 'idle' });
  const [moveResult, setMoveResult] = useState<MoveResultState>(null);

  const { showSuccess, showError } = useSnackbar();
  const findGroupsMutation = useFindMoveTargetGroups();
  const { move, isPending } = useMoveAppointmentsToGroup();

  useEffect(() => {
    if (!open) {
      setSelectedGroupId(null);
      setGroupsState({ phase: 'idle' });
      setMoveResult(null);
    }
  }, [open]);

  const appointmentIdsKey = useMemo(() => appointments.map((a) => a.id).join(','), [appointments]);

  useEffect(() => {
    if (!open || appointments.length === 0) return;
    setGroupsState({ phase: 'loading' });
    findGroupsMutation
      .mutateAsync({ appointmentIds: appointments.map((a) => a.id) })
      .then((res) => {
        setGroupsState({ phase: 'ready', groups: res.data.groups, reason: res.data.reason });
      })
      .catch(() => setGroupsState({ phase: 'error' }));
    // Keyed on the stable id string, not the array/mutation identity (PR #961 loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointmentIdsKey]);

  const groupOptions = groupsState.phase === 'ready'
    ? groupsState.groups.map((g) => ({
        value: g.id,
        label: `Group ${g.code} · ${formatGroupDate(g.scheduledDate)} · ${formatWallTimeWindow(g.timeWindow)} (${g.currentSize} appts)`,
      }))
    : [];

  const selectedGroup = groupsState.phase === 'ready'
    ? groupsState.groups.find((g) => g.id === selectedGroupId)
    : undefined;

  const handleMove = async () => {
    if (!selectedGroupId) return;
    try {
      const res = await move(selectedGroupId, appointments.map((a) => a.id));
      if (!res) return;
      const failures = res.results.filter((r) => r.status !== 'OK');
      // `onSuccess` refreshes the caller's data (it must NOT close the modal) — it
      // runs whenever anything moved, including a partial success.
      if (res.movedCount > 0) onSuccess?.();
      if (failures.length === 0) {
        // Full success → announce and let the parent close.
        if (res.movedCount > 0) {
          const label = selectedGroup ? ` to group ${selectedGroup.code}` : '';
          showSuccess(`${res.movedCount} appointment${res.movedCount === 1 ? '' : 's'} moved${label}`);
        }
        onClose();
      } else {
        // Partial or total failure → keep the modal open so the per-item failure
        // envelope is actually seen (the whole point of the mixed-result response).
        setMoveResult({ results: res.results });
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to move appointments');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Move to another group" maxWidth="560px">
      <div className="space-y-3" data-testid="move-to-group-modal">
        {appointments.length === 0 ? (
          <p className="text-sm text-text-secondary" data-testid="move-to-group-no-selection">
            These appointments are no longer available. Close and try again.
          </p>
        ) : (
        <>
        <p className="text-sm text-text-secondary">
          Pick the group to move the {appointments.length} selected appointment{appointments.length === 1 ? '' : 's'} into.
        </p>

        {groupsState.phase === 'loading' && (
          <p className="text-xs text-text-muted">Loading available groups…</p>
        )}
        {groupsState.phase === 'error' && (
          <p className="text-xs text-error">Failed to load available groups. Please try again.</p>
        )}
        {groupsState.phase === 'ready' && groupsState.reason === 'MIXED_APPOINTMENT_PROPERTIES' && (
          <div role="alert" className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800" data-testid="move-to-group-mixed-banner">
            Selected appointments don&apos;t share the same service type — refine your selection to one service type.
          </div>
        )}
        {groupsState.phase === 'ready' && groupsState.reason === 'INVALID_APPOINTMENT_STATUS' && (
          <div role="alert" className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800" data-testid="move-to-group-invalid-status-banner">
            Only <strong>Draft</strong>, <strong>Awaiting Inspector</strong> or <strong>Scheduled</strong> appointments can be moved — deselect the others and try again.
          </div>
        )}
        {groupsState.phase === 'ready' && groupsState.reason === 'NOT_GROUPED' && (
          <div role="alert" className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800" data-testid="move-to-group-not-grouped-banner">
            Only appointments already in a group can be moved. Use <strong>Add to group</strong> for ungrouped appointments.
          </div>
        )}
        {groupsState.phase === 'ready' && !groupsState.reason && groupsState.groups.length === 0 && (
          <div className="rounded border border-border-subtle bg-gray-50 px-3 py-2 text-xs text-text-secondary" data-testid="move-to-group-empty-banner">
            No other active group is available for these appointments.
          </div>
        )}

        {groupsState.phase === 'ready' && groupsState.groups.length > 0 && (
          <SelectInput
            value={selectedGroupId ?? ''}
            onChange={(v) => setSelectedGroupId(v || null)}
            options={groupOptions}
            placeholder="Select a group…"
            aria-label="Destination group"
          />
        )}

        {selectedGroup?.isCurrentDay && (
          <div role="alert" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="move-to-group-current-day-banner">
            This group is scheduled for <strong>today</strong>. The appointment{appointments.length === 1 ? '' : 's'} will be moved in as if the tenant has <strong>already confirmed</strong>.
          </div>
        )}

        {selectedGroup && (() => {
          const groupDay = selectedGroup.scheduledDate.slice(0, 10);
          const hasDateMismatch = appointments.some((a) => a.scheduledDate && a.scheduledDate.slice(0, 10) !== groupDay);
          if (!hasDateMismatch) return null;
          return (
            <div role="status" className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800" data-testid="move-to-group-date-sync-banner">
              Appointments on a different date will be moved to the group&apos;s date ({formatGroupDate(selectedGroup.scheduledDate)}).
            </div>
          );
        })()}

        {moveResult && (
          <div className="rounded border border-border-subtle bg-gray-50 px-3 py-2 text-xs" data-testid="move-to-group-result">
            <p className="mb-1 font-medium">
              {moveResult.results.filter((r) => r.status === 'OK').length} moved · {moveResult.results.filter((r) => r.status !== 'OK').length} failed
            </p>
            {moveResult.results.filter((r) => r.status !== 'OK').length > 0 && (
              <ul className="space-y-0.5 text-text-secondary">
                {moveResult.results.filter((r) => r.status !== 'OK').map((r) => {
                  const appt = appointments.find((a) => a.id === r.appointmentId);
                  return (
                    <li key={r.appointmentId}>
                      <AppointmentCodePill code={appt?.code ?? r.appointmentId} /> — {r.error?.message ?? r.status}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        </>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:bg-gray-50"
            data-testid="move-to-group-close"
          >
            {moveResult ? 'Done' : 'Cancel'}
          </button>
          {!moveResult && appointments.length > 0 && (
            <button
              type="button"
              onClick={handleMove}
              disabled={!selectedGroupId || isPending}
              className="rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="move-to-group-confirm"
            >
              {isPending ? 'Moving…' : `Move ${appointments.length} to group`}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
