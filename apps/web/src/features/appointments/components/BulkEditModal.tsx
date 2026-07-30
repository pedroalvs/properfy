import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  todayInTzDateString,
  PLATFORM_TIMEZONE,
  getValidTransitions,
  isReasonRequired,
  type AppointmentStatus,
  type BulkActionResponse,
} from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/forms/SelectInput';
import { Textarea } from '@/components/forms/Textarea';
import { Checkbox } from '@/components/forms/Checkbox';
import { TimeRangeInput } from '@/components/forms/TimeRangeInput';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';
import { useFormOptions } from '@/hooks/useFormOptions';
import { usePermissions } from '@/hooks/usePermissions';
import { api } from '@/services/api';
import { ContactAutocomplete } from './ContactAutocomplete';
import { useBulkCrossCheckDone } from '../hooks/useBulkCrossCheckDone';
import { useBulkStatusTransition } from '../hooks/useBulkStatusTransition';
import type { ContactSearchResult } from '../hooks/useContactSearch';
import type { Appointment } from '../types';
import { DateInput } from '@/components/forms/DateInput';

/** Toggle keys (one checkbox per row). The single `timeSlot` toggle drives a
 *  free start/end time range that emits BOTH `timeSlotStart` and `timeSlotEnd`
 *  into the bulk-edit `changes` payload (the backend bulk schema expects them
 *  together). */
type FieldKey =
  | 'assignedInspectorId'
  | 'scheduledDate'
  | 'timeSlot'
  | 'serviceTypeId'
  | 'propertyManagerContactId';

/** Value model — one string per change field. The `timeSlot` toggle splits
 *  into the two `timeSlotStart` / `timeSlotEnd` value keys. */
interface BulkEditValues {
  assignedInspectorId?: string;
  scheduledDate?: string;
  timeSlotStart?: string;
  timeSlotEnd?: string;
  serviceTypeId?: string;
  propertyManagerContactId?: string;
}

/** Branch is intentionally NOT in this list — bulk-changing the branch of
 *  multiple appointments is too error-prone and was removed from the UI per
 *  product feedback (the backend still accepts it; it's just no longer exposed). */
const FIELD_LABELS: Record<FieldKey, string> = {
  assignedInspectorId: 'Inspector',
  scheduledDate: 'Scheduled Date',
  timeSlot: 'Time Slot',
  serviceTypeId: 'Service Type',
  propertyManagerContactId: 'Add Property Manager Contact (only when missing)',
};

/** Matches the backend `BulkEditResult` from
 *  `apps/backend/src/modules/appointment/application/use-cases/bulk-edit-appointments.use-case.ts`. */
interface BulkEditResult {
  updated: number;
  failed: Array<{ id: string; code: string; message: string }>;
}

/**
 * Folds the bulk status-transition envelope into the `{ updated, failed }`
 * shape this modal's result view already renders, so both bulk paths share
 * one summary UI.
 *
 * `IDEMPOTENT_REPLAY` counts as updated. The backend guard is a 3-minute
 * double-click window (`REPLAY_WINDOW_MINUTES` in `bulk-action-shared.ts`),
 * not a per-day rule — so a replay means this exact transition succeeded
 * seconds ago and the operator is seeing their own duplicate submit. Calling
 * that a failure would be noise.
 *
 * The backend already emits domain-level `{ code, message }` per row via
 * `mapErrorToResult`, so the message is passed through rather than restated.
 */
function toBulkEditResult(results: BulkActionResponse['results']): BulkEditResult {
  const failed = results
    .filter((r) => r.status !== 'OK' && r.status !== 'IDEMPOTENT_REPLAY')
    .map((r) => ({
      id: r.appointmentId,
      code: r.error?.code ?? r.status,
      message: r.error?.message ?? r.status,
    }));
  return { updated: results.length - failed.length, failed };
}

/** Mirrors `bulkStatusTransitionRequestSchema` in
 *  `packages/shared/src/schemas/appointment.ts` (`reason: min(3).max(500)`).
 *  Named so the submit gate, the field cap and the label copy cannot drift
 *  apart from each other or from the server-side bound. */
const REASON_MIN_LENGTH = 3;
const REASON_MAX_LENGTH = 500;

interface BulkEditModalProps {
  selectedAppointments: Appointment[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkEditModal({ selectedAppointments, open, onClose, onSuccess }: BulkEditModalProps) {
  const selectedIds = useMemo(() => selectedAppointments.map((a) => a.id), [selectedAppointments]);
  const { canPerform, role } = usePermissions();
  const canReview = canPerform('appointment.cross_check');
  // AM/OP only — mirrors the server-side gate on the bulk endpoint. Deliberately
  // NOT the page's `appointment.cancel` gate, which also lets CL roles in.
  const canChangeStatus = canPerform('appointment.bulk_status_transition');
  const bulkCrossCheck = useBulkCrossCheckDone();
  const bulkStatusTransition = useBulkStatusTransition();

  // "Mark as Reviewed" cross-checks DONE appointments. It targets a different
  // status (DONE) than the field edits (DRAFT / AWAITING_INSPECTOR), so it is
  // mutually exclusive with them — checking it disables the other rows and vice
  // versa. This keeps the single {updated, failed} result UI intact without
  // juggling two overlapping mutations.
  const reviewableCount = useMemo(
    () => selectedAppointments.filter((a) => a.status === 'DONE' && !a.doneCheckedByUserId).length,
    [selectedAppointments],
  );

  // Derive a single tenant from the selection. Used to scope the inspector
  // dropdown. When the selection spans tenants, the inspector field is disabled
  // with a helper.
  const { activeTenantId, multiTenant } = useMemo(() => {
    const tenantSet = new Set(selectedAppointments.map((a) => a.tenantId));
    return {
      activeTenantId: tenantSet.size === 1 ? [...tenantSet][0]! : undefined,
      multiTenant: tenantSet.size > 1,
    };
  }, [selectedAppointments]);

  const [enabledFields, setEnabledFields] = useState<Record<FieldKey, boolean>>({
    assignedInspectorId: false,
    scheduledDate: false,
    timeSlot: false,
    serviceTypeId: false,
    propertyManagerContactId: false,
  });
  const [reviewed, setReviewed] = useState(false);
  const [changeStatus, setChangeStatus] = useState(false);
  const [pickedTarget, setPickedTarget] = useState<AppointmentStatus | ''>('');
  const [statusReason, setStatusReason] = useState('');
  const [notifyRentalTenant, setNotifyRentalTenant] = useState(false);
  const [values, setValues] = useState<BulkEditValues>({});
  const [pmContactLabel, setPmContactLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkEditResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorsExpanded, setErrorsExpanded] = useState(false);

  // ── Dropdown sources (stable query keys → cached, never refetched on field toggle)
  const { options: inspectorApiOptions, isLoading: inspectorsLoading } = useFormOptions<{ id: string; name: string }>(
    ['inspectors', 'bulk-edit', activeTenantId ?? ''],
    '/v1/inspectors',
    (item) => ({ value: item.id, label: item.name }),
    { status: 'ACTIVE', ...(activeTenantId ? { tenantId: activeTenantId } : {}) },
    { enabled: !!activeTenantId },
  );

  const { options: serviceTypeOptions, isLoading: serviceTypesLoading } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'bulk-edit'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
  );

  // ── Change status ────────────────────────────────────────────────────────
  // Only offer targets EVERY selected row can reach, so the dropdown never
  // promises an option that would fail for part of the batch. Mixed selections
  // therefore narrow the menu rather than producing per-row rejections.
  const statusTargets = useMemo(() => {
    if (!role || selectedAppointments.length === 0) return [] as AppointmentStatus[];
    const perRow = selectedAppointments.map(
      (a) => new Set(getValidTransitions(a.status as AppointmentStatus, role)),
    );
    return Array.from(perRow.reduce((acc, s) => new Set([...acc].filter((t) => s.has(t)))));
  }, [selectedAppointments, role]);

  const statusTargetOptions = useMemo(
    () => statusTargets.map((t) => ({ value: t, label: APPOINTMENT_STATUS_MAP[t]?.label ?? t })),
    [statusTargets],
  );

  // Derived, not stored: if the selection changes under a picked target, drop
  // the stale pick instead of letting SelectInput silently fall back to the
  // placeholder while `pickedTarget` still holds the old value.
  const targetStatus = pickedTarget && statusTargets.includes(pickedTarget) ? pickedTarget : '';

  // Require a reason if ANY selected row requires one — not just the first.
  // DRAFT → AWAITING_INSPECTOR needs no reason but REJECTED → AWAITING_INSPECTOR
  // does, so a mixed batch judged on row 0 alone would be rejected server-side.
  const statusReasonRequired = useMemo(
    () =>
      !!targetStatus &&
      selectedAppointments.some((a) => isReasonRequired(a.status as AppointmentStatus, targetStatus)),
    [selectedAppointments, targetStatus],
  );

  // Cancelling in bulk can notify tenants, but only those who had confirmed. Offer
  // the opt-in only when the selection contains at least one, and name them so the
  // operator sees who would actually be contacted.
  const confirmedForCancel = useMemo(
    () =>
      targetStatus === 'CANCELLED'
        ? selectedAppointments.filter((a) => a.rentalTenantConfirmationStatus === 'CONFIRMED')
        : [],
    [targetStatus, selectedAppointments],
  );

  // The row sits last in a scrolling dialog, so the controls it reveals land
  // below the fold and its dropdown would open into the clipped region. Bring
  // the row into view on check. Keyed on the boolean, so it fires once per
  // toggle and never on unrelated renders.
  const changeStatusRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (changeStatus) {
      // Instant, not smooth: SelectInput measures placement when the menu
      // opens, so an in-flight animated scroll would have it decide against
      // stale geometry if the operator clicks straight through.
      changeStatusRowRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    }
  }, [changeStatus]);

  const changeStatusReady =
    !!targetStatus && (!statusReasonRequired || statusReason.trim().length >= REASON_MIN_LENGTH);

  // Failure rows identify the appointment by its human-readable code — an id
  // fragment tells the operator nothing about which row to go fix. Falls back
  // to the raw id if the row is somehow not in the current selection.
  const codeOf = useCallback(
    (id: string) => selectedAppointments.find((a) => a.id === id)?.code ?? id,
    [selectedAppointments],
  );

  const reset = useCallback(() => {
    setEnabledFields({
      assignedInspectorId: false,
      scheduledDate: false,
      timeSlot: false,
      serviceTypeId: false,
      propertyManagerContactId: false,
    });
    setReviewed(false);
    setChangeStatus(false);
    setPickedTarget('');
    setStatusReason('');
    setValues({});
    setPmContactLabel('');
    setResult(null);
    setErrorMessage(null);
    setErrorsExpanded(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const toggleField = (key: FieldKey) => {
    setEnabledFields((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next[key]) {
        setValues((v) => {
          const copy = { ...v };
          if (key === 'timeSlot') {
            delete copy.timeSlotStart;
            delete copy.timeSlotEnd;
          } else {
            delete copy[key];
          }
          return copy;
        });
        if (key === 'propertyManagerContactId') setPmContactLabel('');
      }
      return next;
    });
  };

  const setFieldValue = (key: keyof BulkEditValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handlePmContactSelect = useCallback((contact: ContactSearchResult) => {
    setValues((prev) => ({ ...prev, propertyManagerContactId: contact.id }));
    setPmContactLabel(contact.displayName);
  }, []);

  const handlePmContactClear = useCallback(() => {
    setValues((prev) => {
      const copy = { ...prev };
      delete copy.propertyManagerContactId;
      return copy;
    });
    setPmContactLabel('');
  }, []);

  const handleSubmit = async () => {
    // "Change status" path — exclusive with the field edits and with review.
    // The endpoint loops the single-transition use case per item, so RBAC, the
    // state machine and the reason rules are all re-checked server-side and a
    // rejected row never aborts the rest of the batch.
    if (changeStatus) {
      if (!changeStatusReady || !targetStatus) return;
      setSubmitting(true);
      setErrorMessage(null);
      try {
        const response = await bulkStatusTransition.mutateAsync({
          appointmentIds: selectedIds,
          targetStatus,
          ...(statusReasonRequired ? { reason: statusReason.trim() } : {}),
          ...(confirmedForCancel.length > 0 ? { notifyRentalTenant: notifyRentalTenant } : {}),
        });
        const payload = toBulkEditResult(response.data.results);
        setResult(payload);
        if (payload.failed.length === 0) {
          onSuccess();
        }
      } catch (err) {
        setErrorMessage((err as Error)?.message ?? 'Bulk status change failed');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // "Mark as Reviewed" path — exclusive with the field edits. Cross-checks the
    // whole selection; the backend skips non-DONE / already-reviewed ids into
    // `failed[]`, which reuses the same result UI below.
    if (reviewed) {
      setSubmitting(true);
      setErrorMessage(null);
      try {
        const response = await bulkCrossCheck.mutateAsync({ ids: selectedIds });
        const payload = response.data as BulkEditResult;
        setResult(payload);
        if ((payload.failed?.length ?? 0) === 0) {
          onSuccess();
        }
      } catch (err) {
        setErrorMessage((err as Error)?.message ?? 'Bulk review failed');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const changes: Record<string, unknown> = {};
    const scalarKeys = ['assignedInspectorId', 'scheduledDate', 'serviceTypeId', 'propertyManagerContactId'] as const;
    scalarKeys.forEach((key) => {
      const v = values[key]?.trim();
      if (enabledFields[key] && v) {
        changes[key] = v;
      }
    });
    // The single "Time Slot" toggle emits BOTH ends together — the backend bulk
    // schema requires timeSlotStart and timeSlotEnd to be present (or absent) as a pair.
    if (enabledFields.timeSlot) {
      const start = values.timeSlotStart?.trim();
      const end = values.timeSlotEnd?.trim();
      if (!start || !end) {
        setErrorMessage('Enter both a start and end time.');
        return;
      }
      if (start >= end) {
        setErrorMessage('Start time must be before end time.');
        return;
      }
      changes.timeSlotStart = start;
      changes.timeSlotEnd = end;
    }

    if (Object.keys(changes).length === 0) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const body: Record<string, unknown> = { ids: selectedIds, changes };
      // PM contact in the bulk modal is "add only when missing" — never overwrite
      // an existing one. The backend reports skipped appointments with code
      // APPOINTMENT_HAS_EXISTING_CONTACT in the failures list.
      if (enabledFields.propertyManagerContactId) {
        body.options = { propertyManagerContactPolicy: 'addIfMissing' };
      }

      const { data, error } = await (api as any).POST('/v1/appointments/bulk-edit', { body });

      if (error) {
        const err = error as any;
        setErrorMessage(err?.error?.message ?? 'Bulk edit failed');
      } else if (data) {
        const payload: BulkEditResult = (data as any)?.data ?? (data as BulkEditResult);
        setResult(payload);
        if ((payload.failed?.length ?? 0) === 0) {
          onSuccess();
        }
      }
    } catch {
      setErrorMessage('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Exclusivity: field edits, "Mark as Reviewed" and "Change status" are three
  // mutually exclusive modes — checking any one disables the other two.
  const anyFieldChecked = (Object.values(enabledFields) as boolean[]).some(Boolean);
  const hasCheckedFields = anyFieldChecked || reviewed || changeStatus;
  const submitDisabled = !hasCheckedFields || (changeStatus && !changeStatusReady);

  const inspectorDisabled = !activeTenantId;
  const inspectorHelper = multiTenant
    ? 'All selected appointments must share an agency to assign an inspector.'
    : null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={`Bulk Edit (${selectedIds.length} appointments)`}
      maxWidth="560px"
      actions={
        result ? (
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting} disabled={submitDisabled}>
              Apply Changes
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="rounded bg-green-100 px-2 py-1 text-green-800">{result.updated} updated</span>
            {result.failed.length > 0 && (
              <span className="rounded bg-red-100 px-2 py-1 text-red-800">{result.failed.length} failed</span>
            )}
          </div>
          {result.failed.length > 0 && (
            <div>
              <button
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => setErrorsExpanded((v) => !v)}
              >
                {errorsExpanded ? 'Hide' : 'Show'} error details ({result.failed.length})
              </button>
              {errorsExpanded && (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-text-secondary">
                  {result.failed.map((err) => (
                    <li key={err.id} className="rounded border border-border-subtle px-3 py-2">
                      <span className="font-semibold text-text-primary">{codeOf(err.id)}</span>{' '}
                      {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {errorMessage && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <p className="text-sm text-text-secondary">
            Select the fields you want to change. Only checked fields will be updated.
          </p>

          {/* Inspector */}
          <FieldRow
            id="bulk-inspector"
            label={FIELD_LABELS.assignedInspectorId}
            checked={enabledFields.assignedInspectorId}
            onToggle={() => toggleField('assignedInspectorId')}
            helper={inspectorHelper}
            disabled={reviewed || changeStatus}
          >
            <SelectInput
              id="bulk-inspector"
              aria-label="Set inspector"
              value={values.assignedInspectorId ?? ''}
              onChange={(v) => setFieldValue('assignedInspectorId', v)}
              options={inspectorApiOptions}
              placeholder={inspectorsLoading ? 'Loading…' : 'Select inspector'}
              disabled={inspectorDisabled || inspectorsLoading}
            />
          </FieldRow>

          {/* Scheduled Date */}
          <FieldRow
            id="bulk-scheduled-date"
            label={FIELD_LABELS.scheduledDate}
            checked={enabledFields.scheduledDate}
            onToggle={() => toggleField('scheduledDate')}
            disabled={reviewed || changeStatus}
          >
            <DateInput
              id="bulk-scheduled-date"
              aria-label="Set scheduled date"
              value={values.scheduledDate ?? ''}
              onChange={(v) => setFieldValue('scheduledDate', v)}
              min={todayInTzDateString(PLATFORM_TIMEZONE)}
            />
          </FieldRow>

          {/* Time Slot — free start/end range. Both ends are applied together. */}
          <FieldRow
            id="bulk-time-slot"
            label={FIELD_LABELS.timeSlot}
            checked={enabledFields.timeSlot}
            onToggle={() => toggleField('timeSlot')}
            disabled={reviewed || changeStatus}
          >
            <TimeRangeInput
              startTime={values.timeSlotStart ?? ''}
              endTime={values.timeSlotEnd ?? ''}
              onStartChange={(v) => setFieldValue('timeSlotStart', v)}
              onEndChange={(v) => setFieldValue('timeSlotEnd', v)}
              idPrefix="bulk-time-slot"
            />
          </FieldRow>

          {/* Service Type */}
          <FieldRow
            id="bulk-service-type"
            label={FIELD_LABELS.serviceTypeId}
            checked={enabledFields.serviceTypeId}
            onToggle={() => toggleField('serviceTypeId')}
            disabled={reviewed || changeStatus}
          >
            <SelectInput
              id="bulk-service-type"
              aria-label="Set service type"
              value={values.serviceTypeId ?? ''}
              onChange={(v) => setFieldValue('serviceTypeId', v)}
              options={serviceTypeOptions}
              placeholder={serviceTypesLoading ? 'Loading…' : 'Select service type'}
              disabled={serviceTypesLoading}
            />
          </FieldRow>

          {/* PM Contact (add-only) */}
          <FieldRow
            id="bulk-pm-contact"
            label={FIELD_LABELS.propertyManagerContactId}
            checked={enabledFields.propertyManagerContactId}
            onToggle={() => toggleField('propertyManagerContactId')}
            helper="Appointments that already have a PM contact will be skipped."
            disabled={reviewed || changeStatus}
          >
            <ContactAutocomplete
              value={pmContactLabel}
              selectedContactId={values.propertyManagerContactId}
              onSelect={handlePmContactSelect}
              onClear={handlePmContactClear}
              placeholder={
                multiTenant
                  ? 'All selected appointments must share an agency'
                  : 'Search property manager...'
              }
              aria-label="Property Manager Contact"
              // Contacts are per-agency, and useContactSearch stays disabled
              // without a tenant — omitting this left the field unable to
              // return a single result. Scoped to the selection's agency, and
              // disabled when the selection spans several, exactly as the
              // inspector dropdown above behaves.
              tenantId={activeTenantId}
              disabled={multiTenant}
            />
          </FieldRow>

          {/* Mark as Reviewed — AM/OP only. Cross-checks DONE appointments and
              is mutually exclusive with the field edits above. */}
          {canReview && (
            <FieldRow
              id="bulk-reviewed"
              label="Mark as Reviewed"
              checked={reviewed}
              onToggle={() => setReviewed((v) => !v)}
              disabled={anyFieldChecked || changeStatus}
              helper={`${reviewableCount} of ${selectedIds.length} selected are DONE and pending review; the others will be skipped.`}
            />
          )}

          {/* Change status — AM/OP only, gated on the same permission the
              backend enforces. Targets are the intersection across the
              selection, so an option is never offered that part of the batch
              cannot reach. */}
          {canChangeStatus && (
            <FieldRow
              containerRef={changeStatusRowRef}
              id="bulk-change-status"
              label="Change status"
              checked={changeStatus}
              // Unchecking discards the picked target and reason, mirroring how
              // `toggleField` clears a field's value when its row is unchecked.
              // Otherwise re-checking the row would silently restore a stale
              // target the operator had already abandoned.
              onToggle={() =>
                setChangeStatus((v) => {
                  if (v) {
                    setPickedTarget('');
                    setStatusReason('');
                  }
                  return !v;
                })
              }
              disabled={anyFieldChecked || reviewed}
              helper={
                statusTargets.length === 0
                  ? 'No common transition is available for the selected rows.'
                  : null
              }
            >
              <div className="space-y-2">
                <SelectInput
                  id="bulk-change-status"
                  aria-label="Set target status"
                  value={targetStatus}
                  // Changing the target drops the reason: the text was written
                  // to justify a different transition ("Tenant moved out" for a
                  // cancel is not a rejection reason), and carrying it over
                  // would submit it unread against the new target.
                  onChange={(v) => {
                    setPickedTarget(v as AppointmentStatus);
                    setStatusReason('');
                  }}
                  options={statusTargetOptions}
                  placeholder="Select target status"
                  disabled={statusTargets.length === 0}
                />
                {statusReasonRequired && (
                  <label className="block text-sm font-medium text-text-primary">
                    Reason{' '}
                    {/* State the requirement, so a disabled Apply is never
                        unexplained while the operator types. */}
                    <span className="font-normal text-text-muted">
                      (required, at least {REASON_MIN_LENGTH} characters)
                    </span>
                    <Textarea
                      aria-label="Status change reason"
                      value={statusReason}
                      onChange={setStatusReason}
                      maxLength={REASON_MAX_LENGTH}
                      rows={3}
                    />
                  </label>
                )}
                {confirmedForCancel.length > 0 && (
                  <div data-testid="bulk-edit-notify-block">
                    <Checkbox
                      checked={notifyRentalTenant}
                      onChange={setNotifyRentalTenant}
                      label="Notify the tenants who confirmed"
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      Only these confirmed tenants would be emailed/texted. The agency is
                      notified for every cancellation either way.
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {confirmedForCancel.map((a) => (
                        <li key={a.id} className="text-xs text-text-secondary">
                          {a.code}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </FieldRow>
          )}
        </div>
      )}
    </Dialog>
  );
}

function FieldRow({
  id,
  label,
  checked,
  onToggle,
  helper,
  disabled = false,
  containerRef,
  children,
}: {
  id: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  helper?: string | null;
  disabled?: boolean;
  /** Lets a caller scroll this row into view — see the change-status effect. */
  containerRef?: React.Ref<HTMLDivElement>;
  children?: React.ReactNode;
}) {
  return (
    <div ref={containerRef} className="space-y-1">
      <label
        htmlFor={`${id}-checkbox`}
        className={`flex items-center gap-2 text-sm font-medium ${
          disabled ? 'cursor-not-allowed text-text-muted' : 'text-text-primary'
        }`}
      >
        <input
          id={`${id}-checkbox`}
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
          className="h-4 w-4 rounded border-gray-300 accent-primary disabled:opacity-50"
        />
        {label}
      </label>
      {checked && (
        <>
          {children}
          {helper && <p className="text-xs text-text-muted">{helper}</p>}
        </>
      )}
    </div>
  );
}
