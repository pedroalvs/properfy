import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { useResizableWidth } from '@/hooks/useResizableWidth';
import { Dialog } from '@/components/ui/Dialog';
import { ViewportAwareDropdown } from '@/components/ui/ViewportAwareDropdown';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';
import { formatDate } from '@/lib/format-date';
import { getValidTransitions, isReasonRequired } from '@properfy/shared';
import type { AppointmentStatus, UserRole } from '@properfy/shared';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';
import { AppointmentCodePill } from './AppointmentCodePill';
import { ConfirmationChannelIcons } from './ConfirmationChannelIcons';
import { MapBulkRescheduleForm } from './MapBulkRescheduleForm';
import { useBulkCancelAppointments } from '../hooks/useBulkCancelAppointments';
import { useBulkStatusTransition } from '../hooks/useBulkStatusTransition';
import { useBulkResendReminder } from '../hooks/useBulkResendReminder';

/**
 * 026 §FR-530 — Bulk actions reduced to exactly 4 items (alphabetical):
 *   Cancel · Change status · Reschedule · Send confirmation email
 *
 * - "Assign Inspector" REMOVED from the map flow (kept in list-page
 *   `BulkEditModal` per 026 plan — out of scope here).
 * - "Re-send Reminder" RELABELLED to "Send confirmation email"
 *   (endpoint unchanged — still `/v1/appointments/bulk-resend-reminder`).
 * - "Add to group" / "Create group" are FOOTER BUTTONS now (not dropdown
 *   items) per 026 §FR-510 — separate top-level affordances.
 */
export type BulkAction =
  | 'cancel'
  | 'change_status'
  | 'reschedule'
  | 'resend_reminder';

/** 026 §FR-510 — separate footer buttons; NOT in the dropdown. */
export type FooterAction = 'add_to_group' | 'create_group';

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
  /** 026 §FR-560 — click an appointment code pill → open detail panel for that id. */
  onOpenDetailPanel?: (appointmentId: string) => void;
  /** Optional callback after a bulk action finishes; useful for the page to invalidate queries / drop the polygon. */
  onActionComplete?: () => void;
  /**
   * 026 §FR-520 — Position. Desktop default `'top-right'` (compact,
   * no backdrop, map stays interactive); mobile path keeps the centered
   * Dialog with backdrop. Caller can override via prop.
   */
  position?: 'top-right' | 'centered';
  /**
   * T-C4-4 — fires on mount and on drag-end so the page can track the
   * modal width for flyTo padding calculations.
   */
  onResize?: (widthPx: number) => void;
}

interface RowResult {
  appointmentId: string;
  status: string;
  errorMessage?: string;
}

/**
 * 026 §FR-530 — exactly 4 dropdown items, alphabetical order.
 * "Send confirmation email" is the user-facing label for the existing
 * `/bulk-resend-reminder` endpoint (relabel only, route unchanged).
 */
const BULK_ACTIONS: Array<{ key: BulkAction; label: string; allowedRoles: UserRole[]; clFlag?: keyof NonNullable<MapBulkActionModalProps['clUserFlags']> }> = [
  { key: 'cancel', label: 'Cancel appointments', allowedRoles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'], clFlag: 'cancel_appointments' },
  { key: 'change_status', label: 'Change status', allowedRoles: ['AM', 'OP'] },
  { key: 'reschedule', label: 'Reschedule', allowedRoles: ['AM', 'OP', 'CL_ADMIN'] },
  { key: 'resend_reminder', label: 'Send confirmation email', allowedRoles: ['AM', 'OP'] },
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
  onOpenDetailPanel,
  onActionComplete,
  onResize,
  position = 'top-right',
}: MapBulkActionModalProps) {
  const { widthPx, isDragging, onHandleMouseDown } = useResizableWidth({
    initialPx: Math.round(window.innerWidth * 0.6),
    minPx: 480,
    maxPx: Math.round(window.innerWidth * 0.9),
    storageKey: 'appointments-map.bulk-modal.width',
  });

  // T-C4-4 — report modal width to page on mount and on drag end so the
  // page can use it as flyTo right-padding when focusing a code-pill click.
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  // Mount: widthPx is stable here (read from sessionStorage / initial), ref avoids stale closure.
  useEffect(() => { onResizeRef.current?.(widthPx); }, []); // intentional mount-only
  useEffect(() => {
    if (isDragging) return;
    onResizeRef.current?.(widthPx);
  }, [isDragging]); // intentional: only re-run when isDragging flips

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
      render: (row) => (
        <AppointmentCodePill
          code={row.code}
          {...(onOpenDetailPanel ? { onClick: () => onOpenDetailPanel(row.id) } : {})}
        />
      ),
    },
    {
      key: 'client',
      label: 'Client',
      render: (row) => <span className="text-sm text-text-primary">{row.clientName ?? '—'}</span>,
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
  ], [allChecked, indeterminate, checkedIds, onOpenDetailPanel]);

  // ─── Step 2 — action form rendering ──────────────────────────────────────
  const cancelMutation = useBulkCancelAppointments();
  const statusMutation = useBulkStatusTransition();
  const resendMutation = useBulkResendReminder();
  // 026 §FR-540 — reschedule now uses the bulk-reopen-for-reschedule
  // endpoint via `MapBulkRescheduleForm` which encapsulates the
  // same-group precheck + dropdown slot picker.
  // 026 §FR-530 — assign_inspector REMOVED from the map flow.

  const handleActionComplete = (resultsFromApi: Array<{ appointmentId: string; status: string; error?: { message: string } }>) => {
    setResults(resultsFromApi.map((r) => ({
      appointmentId: r.appointmentId,
      status: r.status,
      errorMessage: r.error?.message,
    })));
    onActionComplete?.();
  };

  const visibleActions = BULK_ACTIONS;

  // 026 §FR-540 — Reschedule is bulk-same-group only. If the selection
  // spans groups (or contains non-grouped items), disable with a tooltip
  // explaining the limitation. Backend ALSO returns INVALID_SCOPE.
  const groupScopeStatus = useMemo<{ disabled: boolean; reason?: string }>(() => {
    if (checkedAppointments.length === 0) return { disabled: false };
    const groupIds = new Set(checkedAppointments.map((a) => a.serviceGroupId ?? null));
    if (groupIds.size > 1 || groupIds.has(null)) {
      return { disabled: true, reason: 'Bulk reschedule limited to appointments within the same group in this cycle' };
    }
    return { disabled: false };
  }, [checkedAppointments]);

  const isActionDisabled = (a: typeof BULK_ACTIONS[number]): { disabled: boolean; reason?: string } => {
    if (!isActionAllowed(a, actorRole, clUserFlags)) return { disabled: true, reason: 'Your role cannot perform this action' };
    if (checkedIds.size === 0) return { disabled: true, reason: 'Tick at least one appointment first' };
    if (a.key === 'reschedule' && groupScopeStatus.disabled) {
      return { disabled: true, ...(groupScopeStatus.reason ? { reason: groupScopeStatus.reason } : {}) };
    }
    return { disabled: false };
  };

  // 026 §FR-510 — Add-to-group / Create-group are SEPARATE footer
  // buttons (not in the dropdown). Both AM/OP only; disabled when:
  //   - no rows checked
  //   - selection spans tenants (cross-tenant grouping is impossible per Regras)
  //   - any checked row has an ungroupable status (must be DRAFT, AWAITING_INSPECTOR, or REJECTED)
  const canAddToGroup = actorRole === 'AM' || actorRole === 'OP';
  // T-C4-1 L1 / T-C5-1 L4 — REJECTED is now groupable (auto-transitions to AWAITING_INSPECTOR on join).
  const GROUPABLE_STATUSES = new Set(['DRAFT', 'AWAITING_INSPECTOR', 'REJECTED']);
  const groupButtonState = useMemo<{ disabled: boolean; reason?: string }>(() => {
    if (!canAddToGroup) return { disabled: true, reason: 'Add to group is AM/OP only' };
    if (checkedIds.size === 0) return { disabled: true, reason: 'Tick at least one appointment first' };
    const invalidStatusRows = checkedAppointments.filter((a) => !GROUPABLE_STATUSES.has(a.status));
    if (invalidStatusRows.length > 0) {
      return {
        disabled: true,
        reason: `${invalidStatusRows.length} selected appointment(s) cannot be grouped (status must be Draft, Awaiting Inspector, or Rejected)`,
      };
    }
    const tenantNames = new Set(checkedAppointments.map((c) => c.clientName).filter(Boolean));
    if (tenantNames.size > 1) return { disabled: true, reason: 'Selection spans multiple agencies — pick rows from a single agency' };
    return { disabled: false };
  }, [canAddToGroup, checkedIds.size, checkedAppointments]);

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

  if (!open) return null;

  // 026 §FR-520 — modal body + footer are rendered as a single tree;
  // the wrapper (top-right floating panel vs centered Dialog) changes
  // based on `position` but the inner content stays identical.
  const modalContent = (
    <>
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
        <MapBulkRescheduleForm
          checkedAppointments={checkedAppointments}
          {...(actorTimezone ? { actorTimezone } : {})}
          onCancel={() => setActiveAction(null)}
          onComplete={handleActionComplete}
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
              Close
            </button>
            {activeAction === null ? (
              <>
                {/* T-C4-5 — Cycle 4 override of the cycle-2 "buttons visible+disabled at 0 checked"
                    invariant. User requested full hide at 0 selected: cleaner empty state. */}
                {checkedIds.size > 0 && (
                  <>
                    <BulkActionsDropdown
                      actions={visibleActions}
                      isDisabled={isActionDisabled}
                      selectedCount={checkedIds.size}
                      onSelect={(key) => setActiveAction(key)}
                    />
                    {/* 026 §FR-510 — Add to group / Create group as SEPARATE
                        footer buttons. Both AM/OP only. */}
                    <button
                      type="button"
                      disabled={groupButtonState.disabled}
                      title={groupButtonState.reason}
                      onClick={() => { if (!groupButtonState.disabled) onAddToGroup(Array.from(checkedIds)); }}
                      className="rounded border border-real-estate px-4 py-2 text-sm font-semibold text-real-estate hover:bg-real-estate/5 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="bulk-modal-footer-add-to-group"
                    >
                      Add to group
                    </button>
                    <button
                      type="button"
                      disabled={groupButtonState.disabled}
                      title={groupButtonState.reason}
                      onClick={() => { if (!groupButtonState.disabled) onCreateGroup(Array.from(checkedIds)); }}
                      className="rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="bulk-modal-footer-create-group"
                    >
                      Create group ({checkedIds.size})
                    </button>
                  </>
                )}
              </>
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
    </>
  );

  // 026 §FR-520 — top-right rendering bypasses Dialog entirely so the
  // map stays interactive behind/beside the modal. The centered path
  // keeps the Dialog with backdrop for mobile + tablet viewports where
  // vertical real estate is the constraint.
  if (position === 'top-right') {
    return (
      <div
        className={`fixed right-4 top-4 z-40 flex flex-col overflow-hidden rounded-lg border border-border-subtle bg-card-bg shadow-xl${isDragging ? ' select-none' : ''}`}
        style={{
          width: `min(${widthPx}px, calc(100vw - 32px))`,
          maxHeight: 'calc(100vh - 32px)',
          pointerEvents: 'auto',
        }}
        role="dialog"
        aria-modal="false"
        aria-label="Bulk actions"
        data-testid="map-bulk-action-modal"
      >
        {/* Left-edge resize handle — hidden on mobile (< 640px). */}
        <div
          className="absolute left-0 top-0 hidden h-full w-1.5 cursor-col-resize items-center justify-center sm:flex"
          onMouseDown={onHandleMouseDown}
          aria-hidden="true"
        >
          <div className="h-8 w-0.5 rounded-full bg-border-subtle opacity-60" />
        </div>

        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Bulk actions</h2>
          <button
            type="button"
            onClick={closeAndReset}
            aria-label="Close bulk actions"
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
          >
            <i className="mdi mdi-close text-lg" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {modalContent}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onClose={closeAndReset} title="Bulk actions" maxWidth="880px">
      {modalContent}
    </Dialog>
  );
}

// ─── Bulk Actions Dropdown ───────────────────────────────────────────────
// 026 §FR-501 — wrapped in ViewportAwareDropdown so the menu auto-flips
// when the modal sits at the bottom-right of the viewport (the default
// `position: 'top-right'` puts the trigger near the right edge of the
// viewport, where a fixed `right: 0` positioned menu would clip).

interface BulkActionsDropdownProps {
  actions: typeof BULK_ACTIONS;
  isDisabled: (a: typeof BULK_ACTIONS[number]) => { disabled: boolean; reason?: string };
  selectedCount: number;
  onSelect: (key: BulkAction) => void;
}

function BulkActionsDropdown({ actions, isDisabled, selectedCount, onSelect }: BulkActionsDropdownProps) {
  return (
    <ViewportAwareDropdown
      placement="auto"
      menuMinWidth={224}
      renderInPortal
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
          data-testid="bulk-actions-toggle"
        >
          Bulk actions{selectedCount > 0 ? ` (${selectedCount})` : ''}
          <i className="mdi mdi-chevron-down" />
        </button>
      }
    >
      <div role="menu" className="py-1">
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
    </ViewportAwareDropdown>
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

// 026 §FR-540 — RescheduleForm extracted to its own file as
// `MapBulkRescheduleForm`. The new form uses a dropdown slot picker
// (NOT the previous free-text input) sourced from `useTimeSlotOptions`
// per Regras matrix, and the same-group precheck disables submit when
// the selection spans groups.

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

// 026 §FR-530 — `AssignInspectorForm` removed from the map flow.
// Inspector assignment is still available via the list-page BulkEditModal
// (`apps/web/src/features/appointments/components/BulkEditModal.tsx`),
// which is out of scope for 026.

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
