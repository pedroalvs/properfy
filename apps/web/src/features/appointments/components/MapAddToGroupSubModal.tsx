import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { SelectInput } from '@/components/forms/SelectInput';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { useAppointmentsEligibilityCheck } from '../hooks/useAppointmentsEligibilityCheck';
import { useAddAppointmentsToGroup } from '../hooks/useAddAppointmentsToGroup';
import { AppointmentCodePill } from './AppointmentCodePill';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

interface MapAddToGroupSubModalProps {
  open: boolean;
  onClose: () => void;
  /** The lasso-selected appointments the operator wants to attach to a group. */
  appointments: AppointmentMapItem[];
  /** Called once on success so the page can invalidate map queries + clear lasso. */
  onSuccess?: () => void;
}

interface ServiceGroupOption {
  id: string;
  name: string | null;
  status: string;
  groupSize: number;
  scheduledDate: string;
  tenantName?: string;
  serviceTypeName?: string;
}

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
 *  1. Pick a target group from the list of existing groups in the
 *     active tenant. Selecting a group fires the eligibility-check
 *     endpoint to compute per-appointment eligibility AND per-group
 *     reasons (terminal state / capacity).
 *  2. Confirm — calls the add endpoint with the ELIGIBLE subset only.
 *     The result envelope mirrors 025 (per-item OK / reasonCode), and
 *     a success summary closes the loop.
 */
export function MapAddToGroupSubModal({
  open,
  onClose,
  appointments,
  onSuccess,
}: MapAddToGroupSubModalProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityState>({ phase: 'idle' });
  const [addResult, setAddResult] = useState<AddResultState>(null);

  // Fetch existing groups. Filtered by the active selection's tenant so
  // cross-tenant groups never appear; same tenant is enforced again by
  // the backend validator (defence in depth).
  const tenantName = appointments[0]?.tenantName;
  const groupsParams = useMemo(() => ({
    page: 1,
    pageSize: 50,
    // Only DRAFT and PUBLISHED accept new members; ACCEPTED/CANCELLED/REJECTED
    // are terminal per `ServiceGroupValidator.isAddableStatus`.
    status: 'DRAFT,PUBLISHED',
    ...(tenantName ? { tenantName } : {}),
  }), [tenantName]);

  const { data: groupsResp } = usePaginatedQuery<ServiceGroupOption>(
    ['service-groups', 'addable', tenantName ?? ''],
    '/v1/service-groups',
    groupsParams,
    { enabled: open },
  );
  const groupOptions = (groupsResp?.data ?? []).map((g) => ({
    value: g.id,
    label: g.name ?? `Group ${g.id.slice(0, 8)} · ${g.scheduledDate}`,
  }));

  const eligibilityMutation = useAppointmentsEligibilityCheck(selectedGroupId);
  const addMutation = useAddAppointmentsToGroup(selectedGroupId);

  useEffect(() => {
    if (!open) {
      setSelectedGroupId(null);
      setEligibility({ phase: 'idle' });
      setAddResult(null);
    }
  }, [open]);

  // Fire eligibility-check when a group is picked. Each pick triggers a
  // fresh check — the backend re-validates so a stale preview can never
  // commit a now-invalid add.
  useEffect(() => {
    if (!selectedGroupId || !open) return;
    setEligibility({ phase: 'loading' });
    eligibilityMutation.mutateAsync({
      appointmentIds: appointments.map((a) => a.id),
    }).then((res) => {
      setEligibility({
        phase: 'ready',
        eligible: res.data.eligibleAppointmentIds,
        ineligible: res.data.ineligibleAppointmentIds,
        groupAccepts: res.data.groupAccepts,
        groupReasons: res.data.groupReasons,
      });
    }).catch((err) => {
      setEligibility({ phase: 'error', message: err instanceof Error ? err.message : 'Eligibility check failed' });
    });
    // eligibilityMutation.mutateAsync intentionally omitted from deps;
    // the react-query mutation object changes identity each render,
    // which would cause an infinite re-fire loop.
  }, [selectedGroupId, open, appointments]);

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

        <SelectInput
          value={selectedGroupId ?? ''}
          onChange={(v) => setSelectedGroupId(v || null)}
          options={groupOptions}
          placeholder="Select a service group…"
          aria-label="Service group"
        />

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
