import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolvePlatformSettingValue, getFieldErrors } from '@properfy/shared';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { NumberInput } from '@/components/forms/NumberInput';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useSnackbar } from '@/hooks/useSnackbar';
import { toApiError } from '@/lib/api-error';
import { formatInstantDateTime } from '@/lib/format-date';
import { usePlatformSetting } from '../hooks/usePlatformSetting';

const SAVED_MESSAGE = 'Settings saved.';
const NO_ACCESS_MESSAGE = "You don't have access to platform settings";
const RANGE_ERROR = 'Enter a value between 5 and 240 minutes.';
const HELP_TEXT =
  'Applies to every inspector without a custom limit. Changes show on the Live Day within a minute.';

const FIELD_IDS = {
  delayMinutes: 'live-day-alerts-delay',
  notStartedMinutes: 'live-day-alerts-not-started',
} as const;

interface FormState {
  delayMinutes: string;
  notStartedMinutes: string;
}

interface LoadedValue {
  delayMinutes: number;
  notStartedMinutes: number;
}

function toFormState(value: LoadedValue): FormState {
  return {
    delayMinutes: String(value.delayMinutes),
    notStartedMinutes: String(value.notStartedMinutes),
  };
}

/** Parse a whole-number field; null when it is not an integer. */
function parseIntStrict(raw: string): number | null {
  if (!/^-?\d+$/.test(raw.trim())) return null;
  return Number(raw);
}

function inRange(raw: string): boolean {
  const n = parseIntStrict(raw);
  return n != null && n >= 5 && n <= 240;
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!inRange(form.delayMinutes)) errors.delayMinutes = RANGE_ERROR;
  if (!inRange(form.notStartedMinutes)) errors.notStartedMinutes = RANGE_ERROR;
  return errors;
}

function toValue(form: FormState): Record<string, unknown> {
  return {
    delayMinutes: Number(form.delayMinutes),
    notStartedMinutes: Number(form.notStartedMinutes),
  };
}

interface LiveDayAlertsSettingsSectionProps {
  /** Lifts dirty state so the page's Back button can warn before navigating away. */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * "Live Day alerts" section of the Platform settings page. Reads and writes the
 * `liveDayAlerts` platform-setting key (AM/OP) through the generic
 * `usePlatformSetting` hook — the default delay / not-started limits every
 * inspector inherits unless overridden on their profile. The full key object is
 * replaced on save (last-write-wins, D18).
 */
export function LiveDayAlertsSettingsSection({ onDirtyChange }: LiveDayAlertsSettingsSectionProps) {
  const { setting, isLoading, isError, error, refetch, save, isSaving } = usePlatformSetting('liveDayAlerts');
  const { showSuccess, showError } = useSnackbar();

  const loaded = useMemo<LoadedValue>(
    () => resolvePlatformSettingValue('liveDayAlerts', setting?.value).value as LoadedValue,
    [setting],
  );

  const [form, setForm] = useState<FormState>(() => toFormState(loaded));
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

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

  const errorFor = (field: keyof FormState): string | undefined => serverErrors[field] ?? clientErrors[field];

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
        const firstField = Object.keys(fieldErrors)[0] as keyof typeof FIELD_IDS;
        const id = FIELD_IDS[firstField];
        if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
      } else {
        showError(toApiError(err).message || 'Failed to save Live Day alert settings');
      }
    }
  }, [form, save, showSuccess, showError]);

  if (isLoading) {
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm">
        <LoadingState rows={2} variant="card" />
      </div>
    );
  }

  if (isError) {
    const forbidden = error?.status === 403;
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm">
        <ErrorState message={forbidden ? NO_ACCESS_MESSAGE : "Couldn't load platform settings"} onRetry={refetch} />
      </div>
    );
  }

  const hasErrors = Object.keys(clientErrors).length > 0;

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">Live Day alerts</h3>
        {setting?.isDefault && (
          <span className="inline-block rounded bg-info/10 px-2 py-0.5 text-xs font-semibold text-info">Default</span>
        )}
      </div>
      {setting?.updatedBy && setting.updatedAt && (
        <p className="mb-4 text-xs text-text-muted">
          Last changed by {setting.updatedBy.name} on {formatInstantDateTime(setting.updatedAt)}
        </p>
      )}

      <FormSection>
        <div className="flex max-w-md flex-col gap-4">
          <p className="text-sm text-text-secondary">{HELP_TEXT}</p>

          <FormField label="Delay alert (min)" htmlFor={FIELD_IDS.delayMinutes} error={errorFor('delayMinutes')}>
            <NumberInput
              id={FIELD_IDS.delayMinutes}
              value={form.delayMinutes}
              onChange={(v) => update({ delayMinutes: v })}
              min={5}
              max={240}
              step={1}
              error={!!errorFor('delayMinutes')}
              aria-label="Delay alert (min)"
            />
          </FormField>

          <FormField
            label="Not-started alert (min)"
            htmlFor={FIELD_IDS.notStartedMinutes}
            error={errorFor('notStartedMinutes')}
          >
            <NumberInput
              id={FIELD_IDS.notStartedMinutes}
              value={form.notStartedMinutes}
              onChange={(v) => update({ notStartedMinutes: v })}
              min={5}
              max={240}
              step={1}
              error={!!errorFor('notStartedMinutes')}
              aria-label="Not-started alert (min)"
            />
          </FormField>

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={handleSave} loading={isSaving} disabled={!dirty || hasErrors}>
              Save changes
            </Button>
            <Button variant="secondary" onClick={handleDiscard} disabled={!dirty || isSaving}>
              Discard changes
            </Button>
          </div>
        </div>
      </FormSection>
    </div>
  );
}
