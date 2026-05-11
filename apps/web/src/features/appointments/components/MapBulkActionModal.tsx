import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';
import { formatDate } from '@/lib/format-date';
import { getValidTransitions, isReasonRequired } from '@properfy/shared';
import type { AppointmentStatus, UserRole } from '@properfy/shared';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';
import { AppointmentCodePill } from './AppointmentCodePill';
import { ConfirmationChannelIcons } from './ConfirmationChannelIcons';
import { useBulkCancelAppointments } from '../hooks/useBulkCancelAppointments';
import { useBulkRescheduleAppointments } from '../hooks/useBulkRescheduleAppointments';
import { useBulkStatusTransition } from '../hooks/useBulkStatusTransition';
import { useBulkAssignInspector } from '../hooks/useBulkAssignInspector';
import { useBulkResendReminder } from '../hooks/useBulkResendReminder';
import { useFormOptions } from '@/hooks/useFormOptions';

export type BulkAction =
  | 'cancel'
  | 'reschedule'
  | 'change_status'
  | 'assign_inspector'
  | 'resend_reminder'
  | 'add_to_group'
  | 'create_group';

interface MapBulkActionModalProps {
  /** All appointments enclosed by the lasso polygon. Defaults to fully UNCHECKED. */
  appointments: AppointmentMapItem[];
  open: boolean;
  onClose: () => void;
  /** Browser timezone — forwarded for per-day idempotency bucketing. */
  actorTimezone?: string;
  /** Acting role + CL_USER flags used to gate the bulk-action dropdown options. */
  actorRole: UserRole;
  clUserFlags?: { cancel_appointments?: boolean; reject_appointments?: boolean; reschedule_appointments?: boolean };
  /** Launchers for the two group sub-modals. The page owns those modals so map state stays consolidated. */
  onAddToGroup: (selectedIds: string[]) => void;
  onCreateGroup: (selectedIds: string[]) => void;
  /** Optional callback after a bulk action finishes; useful for the page to invalidate queries / drop the polygon. */
  onActionComplete?: () => void;
}

interface RowResult {
  appointmentId: string;
  status: string;
  errorMessage?: string;
}

const BULK_ACTIONS: Array<{ key: BulkAction; label: string; allowedRoles: UserRole[]; clFlag?: keyof NonNullable<MapBulkActionModalProps['clUserFlags']> }> = [
  { key: 'cancel', label: 'Cancel appointments', allowedRoles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'], clFlag: 'cancel_appointments' },
  { key: 'reschedule', label: 'Reschedule', allowedRoles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'], clFlag: 'reschedule_appointments' },
  { key: 'change_status', label: 'Change status', allowedRoles: ['AM', 'OP'] },
  { key: 'assign_inspector', label: 'Assign / reassign inspector', allowedRoles: ['AM', 'OP'] },
  { key: 'resend_reminder', label: 'Re-send tenant reminder', allowedRoles: ['AM', 'OP'] },
  { key: 'add_to_group', label: 'Add to existing group', allowedRoles: ['AM', 'OP'] },
  { key: 'create_group', label: 'Create new group', allowedRoles: ['AM', 'OP'] },
];

function isActionAllowed(
  action: typeof BULK_ACTIONS[number],
  role: UserRole,
  clFlags?: MapBulkActionModalProps['clUserFlags'],
): boolean {
  if (!action.allowedRoles.includes(role)) return false;
  if (role === 'CL_USER' && action.clFlag) return !!clFlags?.[action.clFlag];
  return true;
}

export function MapBulkActionModal({
  appointments,
  open,
  onClose,
  actorTimezone,
  actorRole,
  clUserFlags,
  onAddToGroup,
  onCreateGroup,
  onActionComplete,
}: MapBulkActionModalProps) {
  // Default UNCHECKED per mockup empty-state: nothing happens until the user
  // explicitly ticks at least one row. The footer state matrix matches this.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [activeAction, setActiveAction] = useState<BulkAction | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setCheckedIds(new Set());
      setActiveAction(null);
      setResults(null);
    }
  }, [open]);

  // Reset checked rows whenever the appointment list changes (lasso re-drawn).
  // Compare ID set to avoid re-clearing on every parent re-render.
  const appointmentIdSignature = useMemo(
    () => appointments.map((a) => a.id).join(','),
    [appointments],
  );
  useEffect(() => {
    setCheckedIds(new Set());
    setActiveAction(null);
    setResults(null);
  }, [appointmentIdSignature]);

  const allChecked = appointments.length > 0 && checkedIds.size === appointments.length;
  const indeterminate = checkedIds.size > 0 && checkedIds.size < appointments.length;

  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(appointments.map((a) => a.id)));
    }
  };

  const toggleOne = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const checkedAppointments = appointments.filter((a) => checkedIds.has(a.id));

  const columns: DataTableColumn<AppointmentMapItem>[] = useMemo(() => [
    {
      key: 'check',
      label: '',
      width: '40px',
      headerRender: () => (
        <input
          type="checkbox"
          aria-label="Select all"
          checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = indeterminate; }}
          onChange={toggleAll}
          data-testid="bulk-modal-select-all"
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.code}`}
          checked={checkedIds.has(row.id)}
          onChange={() => toggleOne(row.id)}
          data-testid={`bulk-modal-row-${row.code}`}
        />
      ),
    },
    {
      key: 'code',
      label: 'Code',
      width: '110px',
      render: (row) => <AppointmentCodePill code={row.code} />,
    },
    {
      key: 'client',
      label: 'Client',
      render: (row) => <span className="text-sm text-text-primary">{row.tenantName ?? '—'}</span>,
    },
    {
      key: 'address',
      label: 'Property',
      render: (row) => <span className="text-sm text-text-secondary">{row.propertyAddress}</span>,
    },
    {
      key: 'scheduled',
      label: 'Scheduled',
      width: '160px',
      render: (row) => (
        <span className="text-sm text-text-secondary">
          {formatDate(row.scheduledDate)} {row.timeSlot}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '140px',
      render: (row) => {
        const meta = APPOINTMENT_STATUS_MAP[row.status as AppointmentStatus];
        return <StatusChip label={meta?.label ?? row.status} bg={meta?.bg ?? '#E0E0E0'} />;
      },
    },
    {
      key: 'inspector',
      label: 'Inspector',
      width: '140px',
      render: (row) => <span className="text-sm text-text-secondary">{row.inspectorName ?? '—'}</span>,
    },
    {
      key: 'confirmation',
      label: 'Confirm',
      width: '80px',
      align: 'center',
      render: (row) => (
        <ConfirmationChannelIcons
          tenantConfirmationStatus={row.tenantConfirmationStatus}
          hasEmail={!!row.contactEmail}
          hasSms={!!row.contactPhone}
        />
      ),
    },
  ], [allChecked, indeterminate, checkedIds]);

  // ─── Step 2 — action form rendering ──────────────────────────────────────
  const cancelMutation = useBulkCancelAppointments();
  const rescheduleMutation = useBulkRescheduleAppointments();
  const statusMutation = useBulkStatusTransition();
  const assignMutation = useBulkAssignInspector();
  const resendMutation = useBulkResendReminder();

  const handleActionComplete = (resultsFromApi: Array<{ appointmentId: string; status: string; error?: { message: string } }>) => {
    setResults(resultsFromApi.map((r) => ({
      appointmentId: r.appointmentId,
      status: r.status,
      errorMessage: r.error?.message,
    })));
    onActionComplete?.();
  };

  const visibleActions = BULK_ACTIONS.filter((a) => {
    // "Add to group" / "Create group" are visible only when selection spans
    // a single tenant. Cross-tenant selections disable both with a tooltip.
    if (a.key === 'add_to_group' || a.key === 'create_group') {
      const tenantNames = new Set(checkedAppointments.map((c) => c.tenantName).filter(Boolean));
      if (tenantNames.size > 1) return true; // still visible but disabled below
    }
    return true;
  });

  const isActionDisabled = (a: typeof BULK_ACTIONS[number]): { disabled: boolean; reason?: string } => {
    if (!isActionAllowed(a, actorRole, clUserFlags)) return { disabled: true, reason: 'Your role cannot perform this action' };
    if (checkedIds.size === 0) return { disabled: true, reason: 'Tick at least one appointment first' };
    if (a.key === 'add_to_group' || a.key === 'create_group') {
      const tenantNames = new Set(checkedAppointments.map((c) => c.tenantName).filter(Boolean));
      if (tenantNames.size > 1) return { disabled: true, reason: 'Selection spans multiple agencies — pick rows from a single agency' };
    }
    return { disabled: false };
  };

  const closeAndReset = () => {
    setActiveAction(null);
    setResults(null);
    onClose();
  };

  // Render the result summary screen (shared across all actions)
  const renderResults = (): ReactNode => {
    if (!results) return null;
    const okCount = results.filter((r) => r.status === 'OK').length;
    const replayCount = results.filter((r) => r.status === 'IDEMPOTENT_REPLAY').length;
    const failCount = results.length - okCount - replayCount;
    return (
      <div className="space-y-3">
        <p className="text-sm text-text-primary">
          <strong>{okCount}</strong> succeeded
          {replayCount > 0 && ` · ${replayCount} already processed today`}
          {failCount > 0 && ` · ${failCount} failed`}
        </p>
        {failCount > 0 && (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded border border-border-subtle p-2 text-xs text-text-secondary">
            {results.filter((r) => r.status !== 'OK' && r.status !== 'IDEMPOTENT_REPLAY').map((r) => {
              const appt = appointments.find((a) => a.id === r.appointmentId);
              return (
                <li key={r.appointmentId}>
                  <AppointmentCodePill code={appt?.code ?? r.appointmentId} /> — {r.status}
                  {r.errorMessage && `: ${r.errorMessage}`}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onClose={closeAndReset} title="Bulk actions" maxWidth="880px">
      {!activeAction && !results && (
        <>
          {appointments.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-secondary">
              No appointments inside the lasso. Try drawing again with a wider area.
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm text-text-secondary">
                Tick the rows you want to act on. Nothing happens until you check at least one.
              </p>
              <div className="max-h-96 overflow-y-auto">
                <DataTable
                  columns={columns}
                  data={appointments}
                  keyExtractor={(row) => row.id}
                />
              </div>
            </>
          )}
        </>
      )}

      {activeAction === 'cancel' && !results && (
        <CancelForm
          loading={cancelMutation.isPending}
          onCancel={() => setActiveAction(null)}
          onSubmit={async (reason) => {
            const res = await cancelMutation.mutateAsync({
              appointmentIds: Array.from(checkedIds),
              reason,
              ...(actorTimezone ? { actorTimezone } : {}),
            });
            handleActionComplete(res.data.results);
          }}
        />
      )}

      {activeAction === 'reschedule' && !results && (
        <RescheduleForm
          loading={rescheduleMutation.isPending}
          onCancel={() => setActiveAction(null)}
          onSubmit={async ({ newDate, newTimeSlot }) => {
            const res = await rescheduleMutation.mutateAsync({
              appointmentIds: Array.from(checkedIds),
              newDate,
              ...(newTimeSlot ? { newTimeSlot } : {}),
              ...(actorTimezone ? { actorTimezone } : {}),
            });
            handleActionComplete(res.data.results);
          }}
        />
      )}

      {activeAction === 'change_status' && !results && (
        <ChangeStatusForm
          checkedAppointments={checkedAppointments}
          actorRole={actorRole}
          clUserFlags={clUserFlags}
          loading={statusMutation.isPending}
          onCancel={() => setActiveAction(null)}
          onSubmit={async ({ targetStatus, reason }) => {
            const res = await statusMutation.mutateAsync({
              appointmentIds: Array.from(checkedIds),
              targetStatus,
              ...(reason ? { reason } : {}),
              ...(actorTimezone ? { actorTimezone } : {}),
            });
            handleActionComplete(res.data.results);
          }}
        />
      )}

      {activeAction === 'assign_inspector' && !results && (
        <AssignInspectorForm
          loading={assignMutation.isPending}
          onCancel={() => setActiveAction(null)}
          onSubmit={async (inspectorId) => {
            const res = await assignMutation.mutateAsync({
              appointmentIds: Array.from(checkedIds),
              inspectorId,
              ...(actorTimezone ? { actorTimezone } : {}),
            });
            handleActionComplete(res.data.results);
          }}
        />
      )}

      {activeAction === 'resend_reminder' && !results && (
        <ResendReminderForm
          loading={resendMutation.isPending}
          onCancel={() => setActiveAction(null)}
          onSubmit={async () => {
            const res = await resendMutation.mutateAsync({
              appointmentIds: Array.from(checkedIds),
              ...(actorTimezone ? { actorTimezone } : {}),
            });
            // bulk-resend uses a different per-item status set (SENT / NO_PRIMARY_CONTACT / ...)
            // but the result shape is compatible enough for the summary.
            handleActionComplete(res.data.results.map((r) => ({
              appointmentId: r.appointmentId,
              status: r.status === 'SENT' ? 'OK' : r.status,
              error: r.error,
            })));
          }}
        />
      )}

      {results && renderResults()}

      {/* Footer state matrix */}
      {!results && (
        <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3" data-testid="bulk-modal-footer">
          <span className="text-sm text-text-secondary">
            {checkedIds.size === 0
              ? 'Select rows to enable actions'
              : `${checkedIds.size} of ${appointments.length} selected`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeAndReset}
              className="rounded border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:bg-gray-50"
            >
              Cancel
            </button>
            {activeAction === null ? (
              <BulkActionsDropdown
                actions={visibleActions}
                isDisabled={isActionDisabled}
                onSelect={(key) => {
                  if (key === 'add_to_group') {
                    onAddToGroup(Array.from(checkedIds));
                    return;
                  }
                  if (key === 'create_group') {
                    onCreateGroup(Array.from(checkedIds));
                    return;
                  }
                  setActiveAction(key);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setActiveAction(null)}
                className="rounded border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:bg-gray-50"
              >
                Back
              </button>
            )}
          </div>
        </div>
      )}

      {results && (
        <div className="mt-4 flex justify-end border-t border-border-subtle pt-3">
          <button
            type="button"
            onClick={closeAndReset}
            className="rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
          >
            Done
          </button>
        </div>
      )}
    </Dialog>
  );
}

// ─── Bulk Actions Dropdown ───────────────────────────────────────────────

interface BulkActionsDropdownProps {
  actions: typeof BULK_ACTIONS;
  isDisabled: (a: typeof BULK_ACTIONS[number]) => { disabled: boolean; reason?: string };
  onSelect: (key: BulkAction) => void;
}

function BulkActionsDropdown({ actions, isDisabled, onSelect }: BulkActionsDropdownProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
        data-testid="bulk-actions-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Bulk actions
        <i className="mdi mdi-chevron-down" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-1 w-56 rounded border border-border-subtle bg-card-bg shadow-lg"
          role="menu"
        >
          {actions.map((action) => {
            const disabled = isDisabled(action);
            return (
              <button
                key={action.key}
                type="button"
                disabled={disabled.disabled}
                title={disabled.reason}
                onClick={() => {
                  if (disabled.disabled) return;
                  setOpen(false);
                  onSelect(action.key);
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  disabled.disabled
                    ? 'cursor-not-allowed text-text-muted'
                    : 'text-text-primary hover:bg-gray-50'
                }`}
                data-testid={`bulk-action-${action.key}`}
                role="menuitem"
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Action forms ────────────────────────────────────────────────────────

interface CancelFormProps {
  loading: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<void>;
}

function CancelForm({ loading, onCancel: _onCancel, onSubmit }: CancelFormProps) {
  const [reason, setReason] = useState('');
  const canSubmit = reason.trim().length >= 3;
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSubmit) void onSubmit(reason.trim()); }}
      className="space-y-3"
    >
      <label className="block text-sm font-medium text-text-primary">
        Reason for cancellation
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={3}
          maxLength={500}
          rows={3}
          className="mt-1 block w-full rounded border border-border-subtle p-2 text-sm"
          data-testid="bulk-cancel-reason"
        />
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
          data-testid="bulk-cancel-apply"
        >
          {loading ? 'Cancelling…' : 'Apply cancellation'}
        </button>
      </div>
    </form>
  );
}

interface RescheduleFormProps {
  loading: boolean;
  onCancel: () => void;
  onSubmit: (input: { newDate: string; newTimeSlot?: string }) => Promise<void>;
}

function RescheduleForm({ loading, onCancel: _onCancel, onSubmit }: RescheduleFormProps) {
  const [newDate, setNewDate] = useState('');
  const [newTimeSlot, setNewTimeSlot] = useState('');
  const canSubmit = newDate.length === 10;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) void onSubmit(newTimeSlot ? { newDate, newTimeSlot } : { newDate });
      }}
      className="space-y-3"
    >
      <label className="block text-sm font-medium text-text-primary">
        New date
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          required
          className="mt-1 block w-full rounded border border-border-subtle p-2 text-sm"
          data-testid="bulk-reschedule-date"
        />
      </label>
      <label className="block text-sm font-medium text-text-primary">
        New time slot (optional)
        <input
          type="text"
          value={newTimeSlot}
          onChange={(e) => setNewTimeSlot(e.target.value)}
          placeholder="HH:mm-HH:mm (e.g. 09:00-10:00)"
          pattern="^\d{2}:\d{2}-\d{2}:\d{2}$"
          className="mt-1 block w-full rounded border border-border-subtle p-2 text-sm"
          data-testid="bulk-reschedule-timeslot"
        />
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
          data-testid="bulk-reschedule-apply"
        >
          {loading ? 'Rescheduling…' : 'Apply reschedule'}
        </button>
      </div>
    </form>
  );
}

interface ChangeStatusFormProps {
  checkedAppointments: AppointmentMapItem[];
  actorRole: UserRole;
  clUserFlags?: MapBulkActionModalProps['clUserFlags'];
  loading: boolean;
  onCancel: () => void;
  onSubmit: (input: { targetStatus: AppointmentStatus; reason?: string }) => Promise<void>;
}

function ChangeStatusForm({ checkedAppointments, actorRole, clUserFlags, loading, onCancel: _onCancel, onSubmit }: ChangeStatusFormProps) {
  // Compute the intersection of valid transitions across all checked rows
  // using the shared matrix. Only show targets that EVERY row can reach so
  // the bulk action is meaningful (mixed-state rows still surface per-item
  // failures via the result envelope, but the menu won't lie about options).
  const targets = useMemo(() => {
    if (checkedAppointments.length === 0) return [] as AppointmentStatus[];
    const sets = checkedAppointments.map((a) =>
      new Set(getValidTransitions(a.status as AppointmentStatus, actorRole, clUserFlags)),
    );
    const intersection = sets.reduce((acc, s) => new Set([...acc].filter((x) => s.has(x))));
    return Array.from(intersection);
  }, [checkedAppointments, actorRole, clUserFlags]);

  const [target, setTarget] = useState<AppointmentStatus | ''>('');
  const [reason, setReason] = useState('');

  // Look up reason requirement from the shared matrix when we have a
  // reasonable "from" status (use the first checked row — same row pinned
  // by the intersection above).
  const fromStatus = checkedAppointments[0]?.status as AppointmentStatus | undefined;
  const needsReason = target && fromStatus ? isReasonRequired(fromStatus, target) : false;
  const canSubmit = !!target && (!needsReason || reason.trim().length >= 3);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || !target) return;
        void onSubmit({ targetStatus: target, ...(needsReason ? { reason: reason.trim() } : {}) });
      }}
      className="space-y-3"
    >
      <label className="block text-sm font-medium text-text-primary">
        Target status
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value as AppointmentStatus | '')}
          required
          className="mt-1 block w-full rounded border border-border-subtle p-2 text-sm"
          data-testid="bulk-change-status-target"
        >
          <option value="">Select…</option>
          {targets.map((t) => (
            <option key={t} value={t}>{APPOINTMENT_STATUS_MAP[t]?.label ?? t}</option>
          ))}
        </select>
      </label>
      {targets.length === 0 && (
        <p className="text-xs text-text-muted">No common transition is available for the selected rows.</p>
      )}
      {needsReason && (
        <label className="block text-sm font-medium text-text-primary">
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            maxLength={500}
            rows={3}
            className="mt-1 block w-full rounded border border-border-subtle p-2 text-sm"
            data-testid="bulk-change-status-reason"
          />
        </label>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
          data-testid="bulk-change-status-apply"
        >
          {loading ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </form>
  );
}

interface AssignInspectorFormProps {
  loading: boolean;
  onCancel: () => void;
  onSubmit: (inspectorId: string) => Promise<void>;
}

function AssignInspectorForm({ loading, onCancel: _onCancel, onSubmit }: AssignInspectorFormProps) {
  const { options } = useFormOptions<{ id: string; name: string }>(
    ['inspectors', 'bulk-assign'],
    '/v1/inspectors',
    (item) => ({ value: item.id, label: item.name }),
    { status: 'ACTIVE' },
  );
  const [inspectorId, setInspectorId] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (inspectorId) void onSubmit(inspectorId); }}
      className="space-y-3"
    >
      <label className="block text-sm font-medium text-text-primary">
        Inspector
        <select
          value={inspectorId}
          onChange={(e) => setInspectorId(e.target.value)}
          required
          className="mt-1 block w-full rounded border border-border-subtle p-2 text-sm"
          data-testid="bulk-assign-inspector-select"
        >
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!inspectorId || loading}
          className="rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
          data-testid="bulk-assign-inspector-apply"
        >
          {loading ? 'Assigning…' : 'Apply'}
        </button>
      </div>
    </form>
  );
}

interface ResendReminderFormProps {
  loading: boolean;
  onCancel: () => void;
  onSubmit: () => Promise<void>;
}

function ResendReminderForm({ loading, onCancel: _onCancel, onSubmit }: ResendReminderFormProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        Re-send the tenant portal reminder to every selected appointment. Same-day repeats
        are skipped automatically.
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={loading}
          className="rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
          data-testid="bulk-resend-reminder-apply"
        >
          {loading ? 'Sending…' : 'Send reminders'}
        </button>
      </div>
    </div>
  );
}
