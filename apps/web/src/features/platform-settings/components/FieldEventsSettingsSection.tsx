import { useEffect, useMemo, useState, useCallback } from 'react';
import { resolvePlatformSettingValue, getFieldErrors, GeofenceMode } from '@properfy/shared';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { NumberInput } from '@/components/forms/NumberInput';
import { Checkbox } from '@/components/forms/Checkbox';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useSnackbar } from '@/hooks/useSnackbar';
import { toApiError } from '@/lib/api-error';
import { formatInstantDateTime } from '@/lib/format-date';
import { usePlatformSetting } from '../hooks/usePlatformSetting';

const SAVED_MESSAGE = 'Field event settings saved. Changes apply within a minute.';
const NO_ACCESS_MESSAGE = "You don't have access to platform settings";

const RADIUS_ERROR = 'Enter a radius between 50 and 5000 m';
const TOLERANCE_ERROR = 'Enter 0 to 240 minutes';
const REMINDER_ERROR = 'Enter 0 to 720 minutes';

const BLOCK_HELP =
  "Inspectors outside the radius can't check in. Falls back to Flag when the property has no coordinates or the phone's GPS accuracy is worse than the radius. There is no per-job override: if a property's location is wrong, fix the property's address before the inspector tries again.";

const FIELD_IDS = {
  geofenceRadiusMeters: 'field-events-geofence-radius',
  checkInWindowToleranceMinutes: 'field-events-window-tolerance',
  completionReminderMinutesAfterWindowEnd: 'field-events-reminder-minutes',
} as const;

interface FormState {
  geofenceRadiusMeters: string;
  geofenceMode: string;
  checkInWindowToleranceMinutes: string;
  completionReminderEnabled: boolean;
  completionReminderMinutesAfterWindowEnd: string;
}

interface LoadedValue {
  geofenceRadiusMeters: number;
  geofenceMode: string;
  checkInWindowToleranceMinutes: number;
  completionReminderEnabled: boolean;
  completionReminderMinutesAfterWindowEnd: number;
}

function toFormState(value: LoadedValue): FormState {
  return {
    geofenceRadiusMeters: String(value.geofenceRadiusMeters),
    geofenceMode: value.geofenceMode,
    checkInWindowToleranceMinutes: String(value.checkInWindowToleranceMinutes),
    completionReminderEnabled: value.completionReminderEnabled,
    completionReminderMinutesAfterWindowEnd: String(value.completionReminderMinutesAfterWindowEnd),
  };
}

/** Parse a whole-number field; null when it is not an integer in the string. */
function parseIntStrict(raw: string): number | null {
  if (!/^-?\d+$/.test(raw.trim())) return null;
  return Number(raw);
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const radius = parseIntStrict(form.geofenceRadiusMeters);
  if (radius == null || radius < 50 || radius > 5000) errors.geofenceRadiusMeters = RADIUS_ERROR;
  const tolerance = parseIntStrict(form.checkInWindowToleranceMinutes);
  if (tolerance == null || tolerance < 0 || tolerance > 240) {
    errors.checkInWindowToleranceMinutes = TOLERANCE_ERROR;
  }
  // The reminder-minutes field is inert while the reminder is off, so it is not
  // validated then (it is also disabled).
  if (form.completionReminderEnabled) {
    const reminder = parseIntStrict(form.completionReminderMinutesAfterWindowEnd);
    if (reminder == null || reminder < 0 || reminder > 720) {
      errors.completionReminderMinutesAfterWindowEnd = REMINDER_ERROR;
    }
  }
  return errors;
}

function toValue(form: FormState): Record<string, unknown> {
  return {
    geofenceRadiusMeters: Number(form.geofenceRadiusMeters),
    geofenceMode: form.geofenceMode,
    checkInWindowToleranceMinutes: Number(form.checkInWindowToleranceMinutes),
    completionReminderEnabled: form.completionReminderEnabled,
    completionReminderMinutesAfterWindowEnd: Number(form.completionReminderMinutesAfterWindowEnd),
  };
}

interface FieldEventsSettingsSectionProps {
  /** Lifts dirty state so the page's Back button can warn before navigating away. */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * "Field events" section of the Platform settings page. Reads and writes the
 * `fieldEvents` platform-setting key (AM/OP) through the generic
 * `usePlatformSetting` hook. The full key object is replaced on save
 * (last-write-wins, D18).
 */
export function FieldEventsSettingsSection({ onDirtyChange }: FieldEventsSettingsSectionProps) {
  const { setting, isLoading, isError, error, refetch, save, isSaving } = usePlatformSetting('fieldEvents');
  const { showSuccess, showError } = useSnackbar();

  const loaded = useMemo<LoadedValue>(
    () => resolvePlatformSettingValue('fieldEvents', setting?.value).value as LoadedValue,
    [setting],
  );

  const [form, setForm] = useState<FormState>(() => toFormState(loaded));
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  // Re-baseline whenever a fresh value loads (initial load, or a refetch after save).
  useEffect(() => {
    setForm(toFormState(loaded));
    setServerErrors({});
  }, [loaded]);

  const clientErrors = useMemo(() => validate(form), [form]);
  const dirty = useMemo(
    () => JSON.stringify(toValue(form)) !== JSON.stringify(toValue(toFormState(loaded))),
    [form, loaded],
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const errorFor = (field: keyof FormState): string | undefined =>
    serverErrors[field] ?? clientErrors[field];

  const update = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setServerErrors({});
  }, []);

  const handleDiscard = useCallback(() => {
    setForm(toFormState(loaded));
    setServerErrors({});
  }, [loaded]);

  const handleSave = useCallback(async () => {
    if (Object.keys(validate(form)).length > 0) return;
    try {
      await save(toValue(form));
      setServerErrors({});
      showSuccess(SAVED_MESSAGE);
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setServerErrors(fieldErrors);
        // Move focus to the first field the server rejected.
        const firstField = Object.keys(fieldErrors)[0] as keyof typeof FIELD_IDS;
        const id = FIELD_IDS[firstField];
        if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
      } else {
        showError(toApiError(err).message || 'Failed to save field event settings');
      }
    }
  }, [form, save, showSuccess, showError]);

  if (isLoading) {
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm">
        <LoadingState rows={4} variant="card" />
      </div>
    );
  }

  if (isError) {
    const forbidden = error?.status === 403;
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm">
        <ErrorState
          message={forbidden ? NO_ACCESS_MESSAGE : "Couldn't load platform settings"}
          onRetry={refetch}
        />
      </div>
    );
  }

  const hasErrors = Object.keys(clientErrors).length > 0;
  const reminderDisabled = !form.completionReminderEnabled;

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">Field events</h3>
        {setting?.isDefault && (
          <span className="inline-block rounded bg-info/10 px-2 py-0.5 text-xs font-semibold text-info">
            Default
          </span>
        )}
      </div>
      {setting?.updatedBy && setting.updatedAt && (
        <p className="mb-4 text-xs text-text-muted">
          Last changed by {setting.updatedBy.name} on {formatInstantDateTime(setting.updatedAt)}
        </p>
      )}

      <FormSection>
        <div className="flex max-w-md flex-col gap-4">
          <FormField
            label="Geofence radius (m)"
            htmlFor={FIELD_IDS.geofenceRadiusMeters}
            error={errorFor('geofenceRadiusMeters')}
            hint="Check-ins farther than this from the property are flagged."
          >
            <NumberInput
              id={FIELD_IDS.geofenceRadiusMeters}
              value={form.geofenceRadiusMeters}
              onChange={(v) => update({ geofenceRadiusMeters: v })}
              min={50}
              max={5000}
              error={!!errorFor('geofenceRadiusMeters')}
              aria-label="Geofence radius"
            />
          </FormField>

          <fieldset className="border-0 p-0">
            <legend className="mb-1 block text-sm font-medium text-text-secondary">Geofence mode</legend>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="radio"
                  name="geofenceMode"
                  value={GeofenceMode.FLAG}
                  checked={form.geofenceMode === GeofenceMode.FLAG}
                  onChange={() => update({ geofenceMode: GeofenceMode.FLAG })}
                />
                Flag (recommended)
              </label>
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="radio"
                  name="geofenceMode"
                  value={GeofenceMode.BLOCK}
                  checked={form.geofenceMode === GeofenceMode.BLOCK}
                  onChange={() => update({ geofenceMode: GeofenceMode.BLOCK })}
                  aria-describedby={form.geofenceMode === GeofenceMode.BLOCK ? 'field-events-block-help' : undefined}
                />
                Block
              </label>
            </div>
            {form.geofenceMode === GeofenceMode.BLOCK && (
              <p id="field-events-block-help" className="mt-1 text-xs text-text-muted">
                {BLOCK_HELP}
              </p>
            )}
          </fieldset>

          <FormField
            label="Time window tolerance (min)"
            htmlFor={FIELD_IDS.checkInWindowToleranceMinutes}
            error={errorFor('checkInWindowToleranceMinutes')}
            hint="Check-ins this many minutes before or after the booked window are not flagged. Out-of-window check-ins are never sent to the tenant."
          >
            <NumberInput
              id={FIELD_IDS.checkInWindowToleranceMinutes}
              value={form.checkInWindowToleranceMinutes}
              onChange={(v) => update({ checkInWindowToleranceMinutes: v })}
              min={0}
              max={240}
              error={!!errorFor('checkInWindowToleranceMinutes')}
              aria-label="Time window tolerance"
            />
          </FormField>

          <Checkbox
            checked={form.completionReminderEnabled}
            onChange={(checked) => update({ completionReminderEnabled: checked })}
            label="Send a reminder to the inspector"
          />

          <FormField
            label="Remind after window end (min)"
            htmlFor={FIELD_IDS.completionReminderMinutesAfterWindowEnd}
            error={errorFor('completionReminderMinutesAfterWindowEnd')}
            hint="If the job isn't checked out by the end of the window plus this time, the inspector gets one reminder."
          >
            <NumberInput
              id={FIELD_IDS.completionReminderMinutesAfterWindowEnd}
              value={form.completionReminderMinutesAfterWindowEnd}
              onChange={(v) => update({ completionReminderMinutesAfterWindowEnd: v })}
              min={0}
              max={720}
              disabled={reminderDisabled}
              error={!!errorFor('completionReminderMinutesAfterWindowEnd')}
              aria-label="Remind after window end"
            />
          </FormField>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={handleSave}
              loading={isSaving}
              disabled={!dirty || hasErrors}
            >
              Save changes
            </Button>
            <Button variant="secondary" onClick={handleDiscard} disabled={!dirty || isSaving}>
              Discard changes
            </Button>
          </div>
          <p className="text-xs text-text-muted">Changes apply within a minute.</p>
        </div>
      </FormSection>
    </div>
  );
}
