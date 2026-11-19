import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@properfy/frontend-standards';
import {
  resolvePlatformSettingValue,
  getFieldErrors,
  InspectorLevel,
  INSPECTOR_LEVEL_LABELS,
  type InspectorProgramSetting,
} from '@properfy/shared';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { NumberInput } from '@/components/forms/NumberInput';
import { SelectInput, type SelectOption } from '@/components/forms/SelectInput';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useSnackbar } from '@/hooks/useSnackbar';
import { toApiError } from '@/lib/api-error';
import { formatInstantDateTime } from '@/lib/format-date';
import { formatProgramInstant } from '@/features/inspector-program/lib/goal-labels';
import { usePlatformSetting } from '../hooks/usePlatformSetting';

const SAVED_MESSAGE = 'Inspector program settings saved.';
const NO_ACCESS_MESSAGE = "You don't have access to platform settings";
const GENERIC_SAVE_ERROR = "We couldn't save these settings. Try again.";
const SCORE_ERROR = 'Enter a number from 0.1 to 100 (one decimal)';
const GOLD_ERROR = 'Gold must be above Silver';
const HOURS_ERROR = 'Enter a whole number from 1 to 72';
const EARLY_ACCESS_HELP =
  'When on, new offers for two or more days ahead are shown first to inspectors at or above the minimum level for the window below. It only applies when at least one of them can take the offer.';
const ENABLED_AT_HELP =
  'Only offers published after you turn this on are affected. Changing the window applies to offers already published.';

const LEVEL_OPTIONS: SelectOption[] = Object.values(InspectorLevel).map((level) => ({
  value: level,
  label: INSPECTOR_LEVEL_LABELS[level],
}));

interface FormState {
  silverMinScore: string;
  goldMinScore: string;
  enabled: boolean;
  hours: string;
  minLevel: InspectorLevel;
}

function toFormState(value: InspectorProgramSetting): FormState {
  return {
    silverMinScore: String(value.levels.silverMinScore),
    goldMinScore: String(value.levels.goldMinScore),
    enabled: value.earlyAccess.enabled,
    hours: String(value.earlyAccess.hours),
    minLevel: value.earlyAccess.minLevel,
  };
}

function isOneDecimalScore(raw: string): boolean {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d)?$/.test(trimmed)) return false;
  const value = Number(trimmed);
  return value > 0 && value <= 100;
}

function isWholeInt(raw: string, min: number, max: number): boolean {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const value = Number(trimmed);
  return value >= min && value <= max;
}

type FieldErrors = Partial<Record<'silverMinScore' | 'goldMinScore' | 'hours', string>>;

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!isOneDecimalScore(form.silverMinScore)) errors.silverMinScore = SCORE_ERROR;
  if (!isOneDecimalScore(form.goldMinScore)) errors.goldMinScore = SCORE_ERROR;
  if (!errors.silverMinScore && !errors.goldMinScore && Number(form.goldMinScore) <= Number(form.silverMinScore)) {
    errors.goldMinScore = GOLD_ERROR;
  }
  if (!isWholeInt(form.hours, 1, 72)) errors.hours = HOURS_ERROR;
  return errors;
}

export interface InspectorProgramSettingsSectionProps {
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * "Inspector program" section of Platform settings (F08 D3). Reads/writes the
 * `inspectorProgram` key. `enabledAt` is server-managed (TASK-F08-2): never an
 * editable field; it is echoed back on save and shown as "On since …" when early
 * access is on (DL8).
 */
export function InspectorProgramSettingsSection({ onDirtyChange }: InspectorProgramSettingsSectionProps) {
  const { setting, isLoading, isError, error, refetch, save, isSaving } = usePlatformSetting('inspectorProgram');
  const { showSuccess, showError } = useSnackbar();

  const loaded = useMemo<InspectorProgramSetting>(
    () => resolvePlatformSettingValue('inspectorProgram', setting?.value).value as InspectorProgramSetting,
    [setting],
  );

  const [form, setForm] = useState<FormState>(() => toFormState(loaded));
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});

  useEffect(() => {
    setForm(toFormState(loaded));
    setServerErrors({});
  }, [loaded]);

  const clientErrors = useMemo(() => validate(form), [form]);
  const errors = useMemo<FieldErrors>(() => ({ ...serverErrors, ...clientErrors }), [serverErrors, clientErrors]);
  const hasErrors = Object.keys(clientErrors).length > 0;
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(toFormState(loaded)), [form, loaded]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const update = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setServerErrors({});
  }, []);

  const handleSave = useCallback(async () => {
    if (Object.keys(validate(form)).length > 0) return;
    const value: InspectorProgramSetting = {
      levels: { silverMinScore: Number(form.silverMinScore), goldMinScore: Number(form.goldMinScore) },
      earlyAccess: {
        enabled: form.enabled,
        hours: Number(form.hours),
        minLevel: form.minLevel,
        // Server-managed; echoed back as loaded (the server recomputes it when enabled flips).
        enabledAt: loaded.earlyAccess.enabledAt,
      },
    };
    try {
      await save(value as unknown as Record<string, unknown>);
      showSuccess(SAVED_MESSAGE);
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) setServerErrors(fieldErrors as FieldErrors);
      else showError(toApiError(err).message || GENERIC_SAVE_ERROR);
    }
  }, [form, loaded, save, showSuccess, showError]);

  if (isLoading) {
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm" id="inspector-program">
        <LoadingState rows={4} variant="card" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm" id="inspector-program">
        <ErrorState
          message={error?.status === 403 ? NO_ACCESS_MESSAGE : "Couldn't load platform settings"}
          onRetry={refetch}
        />
      </div>
    );
  }

  const onSince =
    loaded.earlyAccess.enabled && loaded.earlyAccess.enabledAt
      ? formatProgramInstant(loaded.earlyAccess.enabledAt)
      : null;

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm" id="inspector-program">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">Inspector program</h3>
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
        <fieldset className="border-0 p-0">
          <legend className="mb-2 block text-sm font-medium text-text-secondary">Levels</legend>
          <p className="mb-3 max-w-xl text-sm text-text-secondary">
            Bronze is below Silver. Inspectors without enough jobs have no level.
          </p>
          <div className="grid max-w-md grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Silver from" htmlFor="program-silver" error={errors.silverMinScore}>
              <NumberInput
                id="program-silver"
                value={form.silverMinScore}
                onChange={(v) => update({ silverMinScore: v })}
                min={0.1}
                max={100}
                step={0.1}
                error={Boolean(errors.silverMinScore)}
                aria-label="Silver from"
              />
            </FormField>
            <FormField label="Gold from" htmlFor="program-gold" error={errors.goldMinScore}>
              <NumberInput
                id="program-gold"
                value={form.goldMinScore}
                onChange={(v) => update({ goldMinScore: v })}
                min={0.1}
                max={100}
                step={0.1}
                error={Boolean(errors.goldMinScore)}
                aria-label="Gold from"
              />
            </FormField>
          </div>
        </fieldset>

        <div className="mt-6 flex max-w-md flex-col gap-4">
          <div className="flex items-center justify-between">
            <span id="early-access-label" className="text-sm font-medium text-text-secondary">
              Early offer access
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              aria-labelledby="early-access-label"
              onClick={() => update({ enabled: !form.enabled })}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                form.enabled ? 'bg-primary' : 'bg-text-disabled',
              )}
            >
              <span
                className={cn(
                  'inline-block h-5 w-5 transform rounded-full bg-card-bg transition-transform',
                  form.enabled ? 'translate-x-5' : 'translate-x-1',
                )}
              />
            </button>
          </div>
          <p className="text-xs text-text-secondary">{EARLY_ACCESS_HELP}</p>
          <p className="text-xs text-text-muted">{ENABLED_AT_HELP}</p>
          {onSince && <p className="text-xs text-text-secondary">On since {onSince}</p>}

          <FormField label="Early access window (hours)" htmlFor="program-hours" error={errors.hours}>
            <NumberInput
              id="program-hours"
              value={form.hours}
              onChange={(v) => update({ hours: v })}
              min={1}
              max={72}
              step={1}
              error={Boolean(errors.hours)}
              aria-label="Early access window (hours)"
            />
          </FormField>

          <FormField label="Minimum level" htmlFor="program-min-level">
            <SelectInput
              id="program-min-level"
              value={form.minLevel}
              onChange={(v) => update({ minLevel: v as InspectorLevel })}
              options={LEVEL_OPTIONS}
              aria-label="Minimum level"
            />
          </FormField>
        </div>

        <div className="mt-6">
          <Button variant="primary" onClick={handleSave} loading={isSaving} disabled={!dirty || hasErrors}>
            Save changes
          </Button>
        </div>
      </FormSection>
    </div>
  );
}
