import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { SelectInput } from '@/components/forms/SelectInput';
import { useFindAddableGroupsForAppointments } from '../hooks/useFindAddableGroupsForAppointments';
import { useAppointmentsEligibilityCheck } from '../hooks/useAppointmentsEligibilityCheck';
import { useAddAppointmentsToGroup } from '../hooks/useAddAppointmentsToGroup';
import { AppointmentCodePill } from './AppointmentCodePill';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';
import type { AddableGroupSummary } from '@properfy/shared';

interface MapAddToGroupSubModalProps {
  open: boolean;
  onClose: () => void;
  /** The lasso-selected appointments the operator wants to attach to a group. */
  appointments: AppointmentMapItem[];
  /** Called once on success so the page can invalidate map queries + clear lasso. */
  onSuccess?: () => void;
}

type GroupsState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; groups: AddableGroupSummary[]; reason?: 'MIXED_APPOINTMENT_PROPERTIES' | 'INVALID_APPOINTMENT_STATUS' }
  | { phase: 'error' };

type EligibilityState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; eligible: string[]; ineligible: Array<{ id: string; reasonCode: string }>; groupAccepts: boolean; groupReasons: string[] }
  | { phase: 'error'; message: string };

type AddResultState =
  | null
  | { results: Array<{ appointmentId: string; status: string; error?: { code: string; message: string } }> };

/**
 * 026 §FR-510 — Add-to-group sub-modal.
 *
 * Two-step UX:
 *  1. Pick a target group from the pre-filtered list (026 B1 — only groups
 *     that can actually accept these appointments are shown).
 *  2. Confirm — runs the eligibility-check for per-appointment detail, then
 *     calls the add endpoint with the ELIGIBLE subset only.
 */
export function MapAddToGroupSubModal({
  open,
  onClose,
  appointments,
  onSuccess,
}: MapAddToGroupSubModalProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupsState, setGroupsState] = useState<GroupsState>({ phase: 'idle' });
  const [eligibility, setEligibility] = useState<EligibilityState>({ phase: 'idle' });
  const [addResult, setAddResult] = useState<AddResultState>(null);

  const findGroupsMutation = useFindAddableGroupsForAppointments();
  const eligibilityMutation = useAppointmentsEligibilityCheck(selectedGroupId);
  const addMutation = useAddAppointmentsToGroup(selectedGroupId);

  useEffect(() => {
    if (!open) {
      setSelectedGroupId(null);
      setGroupsState({ phase: 'idle' });
      setEligibility({ phase: 'idle' });
      setAddResult(null);
    }
  }, [open]);

  // Stable key for the appointment IDs — avoids re-firing on parent re-renders.
  const appointmentIdsKey = useMemo(() => appointments.map((a) => a.id).join(','), [appointments]);

  // Fetch addable groups when the modal opens (026 B1 pre-filter).
  useEffect(() => {
    if (!open || appointments.length === 0) return;
    setGroupsState({ phase: 'loading' });
    findGroupsMutation
      .mutateAsync({ appointmentIds: appointments.map((a) => a.id) })
      .then((res) => {
        setGroupsState({
          phase: 'ready',
          groups: res.data.groups,
          reason: res.data.reason,
        });
      })
      .catch(() => setGroupsState({ phase: 'error' }));
  }, [open, appointmentIdsKey]);

  const groupOptions = groupsState.phase === 'ready'
    ? groupsState.groups.map((g) => ({
        value: g.id,
        // Include code + time window + count so similar groups stay distinguishable.
        label: `Group ${g.code} · ${g.timeWindow} (${g.currentSize} appts)`,
      }))
    : [];

  // Fire eligibility-check when a group is picked.
  useEffect(() => {
    if (!selectedGroupId || !open) return;
    setEligibility({ phase: 'loading' });
    eligibilityMutation
      .mutateAsync({ appointmentIds: appointments.map((a) => a.id) })
      .then((res) => {
        setEligibility({
          phase: 'ready',
          eligible: res.data.eligibleAppointmentIds,
          ineligible: res.data.ineligibleAppointmentIds,
          groupAccepts: res.data.groupAccepts,
          groupReasons: res.data.groupReasons,
        });
      })
      .catch((err) => {
        setEligibility({ phase: 'error', message: err instanceof Error ? err.message : 'Eligibility check failed' });
      });
    // eligibilityMutation.mutateAsync intentionally omitted from deps.
  }, [selectedGroupId, open, appointmentIdsKey]);

  const handleAdd = async () => {
    if (eligibility.phase !== 'ready' || eligibility.eligible.length === 0) return;
    const res = await addMutation.mutateAsync({ appointmentIds: eligibility.eligible });
    setAddResult({ results: res.data.results });
    if (res.data.results.some((r) => r.status === 'OK')) onSuccess?.();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add to existing group" maxWidth="560px">
      <div className="space-y-3" data-testid="map-add-to-group-submodal">
        <p className="text-sm text-text-secondary">
          Pick a service group to add the {appointments.length} selected appointment{appointments.length === 1 ? '' : 's'} to.
        </p>

        {/* Groups loading / empty states */}
        {groupsState.phase === 'loading' && (
          <p className="text-xs text-text-muted">Loading compatible groups…</p>
        )}
        {groupsState.phase === 'error' && (
          <p className="text-xs text-error">Failed to load compatible groups. Please try again.</p>
        )}
        {groupsState.phase === 'ready' && groupsState.reason === 'MIXED_APPOINTMENT_PROPERTIES' && (
          <div className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800" data-testid="map-add-to-group-mixed-banner">
            Selected appointments don&apos;t share service type or date — refine your selection to appointments of the same service type and date.
          </div>
        )}
        {groupsState.phase === 'ready' && groupsState.reason === 'INVALID_APPOINTMENT_STATUS' && (
          <div className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800" data-testid="map-add-to-group-invalid-status-banner">
            Only <strong>Draft</strong> or <strong>Awaiting Inspector</strong> appointments can be grouped — deselect the others and try again.
          </div>
        )}
        {groupsState.phase === 'ready' && !groupsState.reason && groupsState.groups.length === 0 && (
          <div className="rounded border border-border-subtle bg-gray-50 px-3 py-2 text-xs text-text-secondary" data-testid="map-add-to-group-empty-banner">
            No compatible group exists for these appointments.{' '}
            <span className="font-medium">Create a new group instead.</span>
          </div>
        )}

        {/* Group selector — only shown when there are options */}
        {groupsState.phase === 'ready' && groupsState.groups.length > 0 && (
          <SelectInput
            value={selectedGroupId ?? ''}
            onChange={(v) => setSelectedGroupId(v || null)}
            options={groupOptions}
            placeholder="Select a service group…"
            aria-label="Service group"
          />
        )}

        {selectedGroupId && eligibility.phase === 'loading' && (
          <p className="text-xs text-text-muted">Checking eligibility…</p>
        )}
        {selectedGroupId && eligibility.phase === 'error' && (
          <p className="text-xs text-error">{eligibility.message}</p>
        )}

        {selectedGroupId && eligibility.phase === 'ready' && (
          <>
            {!eligibility.groupAccepts && (
              <div
                className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
                data-testid="map-add-to-group-group-banner"
              >
                Group cannot accept new appointments: {eligibility.groupReasons.join(', ')}
              </div>
            )}
            {eligibility.ineligible.length > 0 && (
              <div
                className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800"
                data-testid="map-add-to-group-ineligible-banner"
              >
                <p className="font-medium">
                  {eligibility.ineligible.length} appointment{eligibility.ineligible.length === 1 ? '' : 's'} not eligible
                </p>
                <ul className="mt-1 space-y-0.5">
                  {eligibility.ineligible.map((item) => {
                    const appt = appointments.find((a) => a.id === item.id);
                    return (
                      <li key={item.id}>
                        <AppointmentCodePill code={appt?.code ?? item.id} /> — {item.reasonCode}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <p className="text-xs text-text-secondary">
              <strong>{eligibility.eligible.length}</strong> eligible appointment{eligibility.eligible.length === 1 ? '' : 's'} will be added.
            </p>
          </>
        )}

        {addResult && (
          <div className="rounded border border-border-subtle bg-gray-50 px-3 py-2 text-xs" data-testid="map-add-to-group-result">
            <p className="mb-1 font-medium">
              {addResult.results.filter((r) => r.status === 'OK').length} added · {addResult.results.filter((r) => r.status !== 'OK').length} failed
            </p>
            {addResult.results.filter((r) => r.status !== 'OK').length > 0 && (
              <ul className="space-y-0.5 text-text-secondary">
                {addResult.results.filter((r) => r.status !== 'OK').map((r) => {
                  const appt = appointments.find((a) => a.id === r.appointmentId);
                  return (
                    <li key={r.appointmentId}>
                      <AppointmentCodePill code={appt?.code ?? r.appointmentId} /> — {r.status}
                      {r.error?.message ? `: ${r.error.message}` : ''}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:bg-gray-50"
            data-testid="map-add-to-group-close"
          >
            {addResult ? 'Done' : 'Cancel'}
          </button>
          {!addResult && (
            <button
              type="button"
              onClick={handleAdd}
              disabled={
                eligibility.phase !== 'ready'
                || !eligibility.groupAccepts
                || eligibility.eligible.length === 0
                || addMutation.isPending
              }
              className="rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="map-add-to-group-confirm"
            >
              {addMutation.isPending
                ? 'Adding…'
                : `Add ${eligibility.phase === 'ready' ? eligibility.eligible.length : 0} to group`}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
