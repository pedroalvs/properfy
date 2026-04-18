import { useState, useCallback } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api';
import { ContactAutocomplete } from './ContactAutocomplete';
import type { ContactSearchResult } from '../hooks/useContactSearch';

interface BulkEditField {
  key: string;
  label: string;
  placeholder: string;
}

const EDITABLE_FIELDS: BulkEditField[] = [
  { key: 'assignedInspectorId', label: 'Inspector', placeholder: 'Inspector ID' },
  { key: 'scheduledDate', label: 'Scheduled Date', placeholder: 'YYYY-MM-DD' },
  { key: 'timeSlot', label: 'Time Slot', placeholder: 'e.g. 09:00-12:00' },
  { key: 'branchId', label: 'Branch', placeholder: 'Branch ID' },
  { key: 'serviceTypeId', label: 'Service Type', placeholder: 'Service Type ID' },
  { key: 'propertyManagerContactId', label: 'Property Manager Contact', placeholder: 'Contact ID' },
];

interface BulkEditResult {
  updated: number;
  failed: number;
  errors: Array<{ id: string; message: string }>;
}

interface BulkEditModalProps {
  selectedIds: string[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkEditModal({ selectedIds, open, onClose, onSuccess }: BulkEditModalProps) {
  const [enabledFields, setEnabledFields] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [pmContactLabel, setPmContactLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkEditResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorsExpanded, setErrorsExpanded] = useState(false);

  const reset = useCallback(() => {
    setEnabledFields({});
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

  const toggleField = (key: string) => {
    setEnabledFields((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next[key]) {
        setValues((v) => {
          const copy = { ...v };
          delete copy[key];
          return copy;
        });
        if (key === 'propertyManagerContactId') setPmContactLabel('');
      }
      return next;
    });
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
    for (const field of EDITABLE_FIELDS) {
      if (enabledFields[field.key] && values[field.key]?.trim()) {
        changes[field.key] = values[field.key]!.trim();
      }
    }

    if (Object.keys(changes).length === 0) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const { data, error } = await (api as any).POST('/v1/appointments/bulk-edit', {
        body: { ids: selectedIds, changes },
      });

      if (error) {
        const err = error as any;
        setErrorMessage(err?.error?.message ?? 'Bulk edit failed');
      } else if (data) {
        setResult(data as BulkEditResult);
        if ((data as BulkEditResult).failed === 0) {
          onSuccess();
        }
      }
    } catch {
      setErrorMessage('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasCheckedFields = Object.values(enabledFields).some(Boolean);

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
            <Button
              onClick={handleSubmit}
              loading={submitting}
              disabled={!hasCheckedFields}
            >
              Apply Changes
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="rounded bg-green-100 px-2 py-1 text-green-800">
              {result.updated} updated
            </span>
            {result.failed > 0 && (
              <span className="rounded bg-red-100 px-2 py-1 text-red-800">
                {result.failed} failed
              </span>
            )}
          </div>

          {result.errors.length > 0 && (
            <div>
              <button
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => setErrorsExpanded((v) => !v)}
              >
                {errorsExpanded ? 'Hide' : 'Show'} error details ({result.errors.length})
              </button>
              {errorsExpanded && (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-text-secondary">
                  {result.errors.map((err) => (
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

          {EDITABLE_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <input
                  type="checkbox"
                  checked={!!enabledFields[field.key]}
                  onChange={() => toggleField(field.key)}
                  className="h-4 w-4 rounded border-gray-300 accent-primary"
                />
                {field.label}
              </label>
              {enabledFields[field.key] && (
                field.key === 'propertyManagerContactId' ? (
                  <ContactAutocomplete
                    value={pmContactLabel}
                    selectedContactId={values.propertyManagerContactId}
                    onSelect={handlePmContactSelect}
                    onClear={handlePmContactClear}
                    placeholder="Search property manager..."
                    aria-label="Property Manager Contact"
                  />
                ) : (
                  <input
                    type={field.key === 'scheduledDate' ? 'date' : 'text'}
                    value={values[field.key] ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    placeholder={field.placeholder}
                    className="w-full rounded border border-border-subtle bg-card-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
                  />
                )
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
