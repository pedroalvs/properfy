import { useCallback, useEffect, useRef, useState } from 'react';
import type { InspectorAlertThresholdsResponse } from '@properfy/shared';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { DetailRow } from '@/components/data/DetailRow';
import { NumberInput } from '@/components/forms/NumberInput';
import { Checkbox } from '@/components/forms/Checkbox';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useSnackbar } from '@/hooks/useSnackbar';
import { toApiError } from '@/lib/api-error';
import { useInspectorAlertThresholds } from '../hooks/useInspectorAlertThresholds';

const RANGE_ERROR = 'Enter a value between 5 and 240 minutes.';
const SAVED_MESSAGE = 'Alert limits saved.';
const HELP_TEXT =
  "Live Day flags this inspector when they're later than this. Leave on the platform default unless this inspector needs a different limit.";

const DELAY_ID = 'inspector-alert-delay';
const DELAY_DEFAULT_ID = 'inspector-alert-delay-default';
const NOT_STARTED_ID = 'inspector-alert-not-started';

interface FormState {
  delayUseDefault: boolean;
  delayValue: string;
  notStartedUseDefault: boolean;
  notStartedValue: string;
}

function makeForm(data: InspectorAlertThresholdsResponse): FormState {
  return {
    delayUseDefault: data.override.delayMinutes === null,
    delayValue: String(data.override.delayMinutes ?? data.platformDefaults.delayMinutes),
    notStartedUseDefault: data.override.notStartedMinutes === null,
    notStartedValue: String(data.override.notStartedMinutes ?? data.platformDefaults.notStartedMinutes),
  };
}

/** True when the field is active (not on the platform default) and out of the 5–240 integer range. */
function fieldInvalid(useDefault: boolean, value: string): boolean {
  if (useDefault) return false;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return true;
  const n = Number(trimmed);
  return n < 5 || n > 240;
}

function readValue(effective: number, overrideValue: number | null): string {
  return `${effective} min ${overrideValue === null ? '(platform default)' : '(custom)'}`;
}

interface InspectorAlertThresholdsSectionProps {
  inspectorId: string;
}

/**
 * "Live Day alerts" section in the inspector drawer's Details tab (AM/OP only).
 * Reads the inspector's effective delay / not-started thresholds and lets an
 * operator override either one per field, or leave it on the platform default.
 * The hook is disabled for CL roles so no request (and no 403) is made.
 */
export function InspectorAlertThresholdsSection({ inspectorId }: InspectorAlertThresholdsSectionProps) {
  const { user } = useAuth();
  const isAmOp = user?.role === 'AM' || user?.role === 'OP';
  const { data, isLoading, isError, save, isSaving } = useInspectorAlertThresholds(inspectorId, {
    enabled: isAmOp,
  });
  const { showSuccess } = useSnackbar();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Return focus to "Edit" after leaving the form (save or cancel).
  useEffect(() => {
    if (!editing && wasEditing.current) editButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  // Focus the first field (or its checkbox when the field is on the default) on open.
  useEffect(() => {
    if (!editing) return;
    const delayEl = document.getElementById(DELAY_ID) as HTMLInputElement | null;
    if (delayEl && !delayEl.disabled) delayEl.focus();
    else document.getElementById(DELAY_DEFAULT_ID)?.focus();
  }, [editing]);

  const update = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setFormError(null);
  }, []);

  const handleEdit = useCallback(() => {
    if (!data) return;
    setForm(makeForm(data));
    setFormError(null);
    setEditing(true);
  }, [data]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setFormError(null);
  }, []);

  // Escape cancels the inline edit without closing the drawer (web CLAUDE.md §10).
  // A capture-phase document listener runs before the drawer's bubble-phase Escape
  // handler, so stopPropagation here stops the drawer from closing underneath.
  useEffect(() => {
    if (!editing) return undefined;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      handleCancel();
    };
    document.addEventListener('keydown', onEsc, true);
    return () => document.removeEventListener('keydown', onEsc, true);
  }, [editing, handleCancel]);

  const delayInvalid = !!form && fieldInvalid(form.delayUseDefault, form.delayValue);
  const notStartedInvalid = !!form && fieldInvalid(form.notStartedUseDefault, form.notStartedValue);
  const hasErrors = delayInvalid || notStartedInvalid;

  const handleSave = useCallback(async () => {
    if (!form || fieldInvalid(form.delayUseDefault, form.delayValue) || fieldInvalid(form.notStartedUseDefault, form.notStartedValue)) {
      return;
    }
    const body = {
      delayMinutes: form.delayUseDefault ? null : Number(form.delayValue),
      notStartedMinutes: form.notStartedUseDefault ? null : Number(form.notStartedValue),
    };
    try {
      await save(body);
      setFormError(null);
      setEditing(false);
      showSuccess(SAVED_MESSAGE);
    } catch (err) {
      const apiErr = toApiError(err);
      setFormError(
        apiErr.status === 404 ? 'This inspector no longer exists.' : apiErr.message || 'Failed to save alert limits',
      );
    }
  }, [form, save, showSuccess]);

  if (!isAmOp) return null;

  return (
    <FormSection title="Live Day alerts">
      {isLoading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm text-text-muted">Couldn&apos;t load alert limits.</p>
      ) : editing && form ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
          {formError && (
            <p role="alert" className="text-sm text-error">
              {formError}
            </p>
          )}

          <FormField label="Delay alert after (min)" htmlFor={DELAY_ID} error={delayInvalid ? RANGE_ERROR : undefined}>
            <NumberInput
              id={DELAY_ID}
              value={form.delayValue}
              onChange={(v) => update({ delayValue: v })}
              min={5}
              max={240}
              step={1}
              disabled={form.delayUseDefault}
              error={delayInvalid}
              aria-label="Delay alert after (min)"
            />
          </FormField>
          <Checkbox
            id={DELAY_DEFAULT_ID}
            checked={form.delayUseDefault}
            onChange={(checked) => update({ delayUseDefault: checked })}
            label={`Use platform default (${data.platformDefaults.delayMinutes} min)`}
          />

          <FormField
            label="Not-started alert after (min)"
            htmlFor={NOT_STARTED_ID}
            error={notStartedInvalid ? RANGE_ERROR : undefined}
          >
            <NumberInput
              id={NOT_STARTED_ID}
              value={form.notStartedValue}
              onChange={(v) => update({ notStartedValue: v })}
              min={5}
              max={240}
              step={1}
              disabled={form.notStartedUseDefault}
              error={notStartedInvalid}
              aria-label="Not-started alert after (min)"
            />
          </FormField>
          <Checkbox
            checked={form.notStartedUseDefault}
            onChange={(checked) => update({ notStartedUseDefault: checked })}
            label={`Use platform default (${data.platformDefaults.notStartedMinutes} min)`}
          />

          <div className="flex items-center gap-3">
            <Button type="button" variant="primary" onClick={handleSave} loading={isSaving} disabled={hasErrors}>
              Save
            </Button>
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <DetailRow label="Delay alert after" value={readValue(data.effective.delayMinutes, data.override.delayMinutes)} />
          <DetailRow
            label="Not-started alert after"
            value={readValue(data.effective.notStartedMinutes, data.override.notStartedMinutes)}
          />
          <p className="mt-1 text-xs text-text-muted">{HELP_TEXT}</p>
          <div className="mt-2">
            <Button ref={editButtonRef} variant="secondary" onClick={handleEdit}>
              Edit
            </Button>
          </div>
        </>
      )}
    </FormSection>
  );
}
