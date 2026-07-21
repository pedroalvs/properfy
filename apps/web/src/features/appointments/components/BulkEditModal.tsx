import { useState, useCallback, useMemo } from 'react';
import { todayInTzDateString, PLATFORM_TIMEZONE } from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/forms/SelectInput';
import { TimeRangeInput } from '@/components/forms/TimeRangeInput';
import { useFormOptions } from '@/hooks/useFormOptions';
import { api } from '@/services/api';
import { ContactAutocomplete } from './ContactAutocomplete';
import type { ContactSearchResult } from '../hooks/useContactSearch';
import type { Appointment } from '../types';

/** Toggle keys (one checkbox per row). The single `timeSlot` toggle drives a
 *  free start/end time range that emits BOTH `timeSlotStart` and `timeSlotEnd`
 *  into the bulk-edit `changes` payload (the backend bulk schema expects them
 *  together). */
type FieldKey =
  | 'assignedInspectorId'
  | 'scheduledDate'
  | 'timeSlot'
  | 'serviceTypeId'
  | 'propertyManagerContactId'
  | 'markReviewed';

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
  markReviewed: 'Mark as Reviewed',
};

/** Matches the backend `BulkEditResult` from
 *  `apps/backend/src/modules/appointment/application/use-cases/bulk-edit-appointments.use-case.ts`. */
interface BulkEditResult {
  updated: number;
  failed: Array<{ id: string; code: string; message: string }>;
}

interface BulkEditModalProps {
  selectedAppointments: Appointment[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkEditModal({ selectedAppointments, open, onClose, onSuccess }: BulkEditModalProps) {
  const selectedIds = useMemo(() => selectedAppointments.map((a) => a.id), [selectedAppointments]);

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
    markReviewed: false,
  });
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

  const reset = useCallback(() => {
    setEnabledFields({
      assignedInspectorId: false,
      scheduledDate: false,
      timeSlot: false,
      serviceTypeId: false,
      propertyManagerContactId: false,
      markReviewed: false,
    });
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
      // "Mark as Reviewed" is exclusive of field edits (mirrors the backend
      // schema refine): enabling it deselects everything else and vice versa.
      if (next[key]) {
        if (key === 'markReviewed') {
          (Object.keys(next) as FieldKey[]).forEach((k) => {
            if (k !== 'markReviewed') next[k] = false;
          });
          setValues({});
          setPmContactLabel('');
        } else {
          next.markReviewed = false;
        }
      }
      if (!next[key]) {
        setValues((v) => {
          const copy = { ...v };
          if (key === 'timeSlot') {
            delete copy.timeSlotStart;
            delete copy.timeSlotEnd;
          } else if (key !== 'markReviewed') {
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
    const changes: Record<string, unknown> = {};
    if (enabledFields.markReviewed) {
      changes.markReviewed = true;
    }
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

  const hasCheckedFields = (Object.values(enabledFields) as boolean[]).some(Boolean);

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
            <Button onClick={handleSubmit} loading={submitting} disabled={!hasCheckedFields}>
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
                      <span className="font-mono text-xs text-text-muted">{err.id.slice(0, 8)}...</span>{' '}
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
          >
            <input
              id="bulk-scheduled-date"
              aria-label="Set scheduled date"
              type="date"
              value={values.scheduledDate ?? ''}
              onChange={(e) => setFieldValue('scheduledDate', e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()}
              min={todayInTzDateString(PLATFORM_TIMEZONE)}
              className="w-full rounded border border-border-subtle bg-card-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
            />
          </FieldRow>

          {/* Time Slot — free start/end range. Both ends are applied together. */}
          <FieldRow
            id="bulk-time-slot"
            label={FIELD_LABELS.timeSlot}
            checked={enabledFields.timeSlot}
            onToggle={() => toggleField('timeSlot')}
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
          >
            <ContactAutocomplete
              value={pmContactLabel}
              selectedContactId={values.propertyManagerContactId}
              onSelect={handlePmContactSelect}
              onClear={handlePmContactClear}
              placeholder="Search property manager..."
              aria-label="Property Manager Contact"
            />
          </FieldRow>

          {/* Mark as Reviewed (cross-check DONE) — exclusive of field edits */}
          <FieldRow
            id="bulk-mark-reviewed"
            label={FIELD_LABELS.markReviewed}
            checked={enabledFields.markReviewed}
            onToggle={() => toggleField('markReviewed')}
            helper="Only DONE appointments not yet reviewed will be processed; others will be skipped."
          >
            {null}
          </FieldRow>
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
  children,
}: {
  id: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  helper?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={`${id}-checkbox`} className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <input
          id={`${id}-checkbox`}
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 rounded border-gray-300 accent-primary"
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
