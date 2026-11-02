import { useEffect, useMemo, useState, useCallback } from 'react';
import { resolvePlatformSettingValue, type RouteWeightsSetting } from '@properfy/shared';
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
import { RouteWeightsPreview } from './RouteWeightsPreview';

const SAVED_MESSAGE = 'Route weights saved. They apply to the next route calculation.';
const NO_ACCESS_MESSAGE = "You don't have access to platform settings";
const WEIGHT_ERROR = 'Enter a number from 0 to 10 with at most one decimal place';
const GROUP_ERROR = 'At least one weight must be greater than 0';

const INTRO =
  "These weights decide the suggested order of each inspector's day. Time windows are always respected when possible; the weights choose between valid orders.";

type WeightKey = 'travel' | 'windowWait' | 'baseProximity';

const FIELDS: { key: WeightKey; label: string; hint: string; id: string }[] = [
  {
    key: 'travel',
    label: 'Driving time',
    hint: 'Higher values prefer orders with less total driving.',
    id: 'route-weight-travel',
  },
  {
    key: 'windowWait',
    label: 'Waiting for windows',
    hint: 'Higher values avoid arriving early and waiting for a time window to open.',
    id: 'route-weight-window-wait',
  },
  {
    key: 'baseProximity',
    label: 'Starting near the base',
    hint: "Higher values prefer a first stop close to the inspector's base address.",
    id: 'route-weight-base-proximity',
  },
];

type FormState = Record<WeightKey, string>;

function toFormState(value: RouteWeightsSetting): FormState {
  return {
    travel: String(value.travel),
    windowWait: String(value.windowWait),
    baseProximity: String(value.baseProximity),
  };
}

/** A single weight input is valid when it is 0..10 with at most one decimal place. */
function isValidWeight(raw: string): boolean {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d)?$/.test(trimmed)) return false;
  const value = Number(trimmed);
  return value >= 0 && value <= 10;
}

interface FieldErrors {
  travel?: string;
  windowWait?: string;
  baseProximity?: string;
  group?: string;
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  for (const { key } of FIELDS) {
    if (!isValidWeight(form[key])) errors[key] = WEIGHT_ERROR;
  }
  // The group rule only applies once every field is individually valid.
  if (!errors.travel && !errors.windowWait && !errors.baseProximity) {
    const sum = Number(form.travel) + Number(form.windowWait) + Number(form.baseProximity);
    if (sum <= 0) errors.group = GROUP_ERROR;
  }
  return errors;
}

function toValue(form: FormState): RouteWeightsSetting {
  return {
    travel: Number(form.travel),
    windowWait: Number(form.windowWait),
    baseProximity: Number(form.baseProximity),
  };
}

interface RouteWeightsSettingsSectionProps {
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * "Route planning" section of the Platform settings page. Reads and writes the
 * `routeWeights` platform-setting key (AM/OP) through the generic
 * `usePlatformSetting` hook, and offers a before-you-save preview of the form's
 * weights against a real inspector/day.
 */
export function RouteWeightsSettingsSection({ onDirtyChange }: RouteWeightsSettingsSectionProps) {
  const { setting, isLoading, isError, error, refetch, save, isSaving } = usePlatformSetting('routeWeights');
  const { showSuccess, showError } = useSnackbar();

  const loaded = useMemo<RouteWeightsSetting>(
    () => resolvePlatformSettingValue('routeWeights', setting?.value).value as RouteWeightsSetting,
    [setting],
  );

  const [form, setForm] = useState<FormState>(() => toFormState(loaded));

  // Re-baseline whenever a fresh value loads (initial load, or a refetch after save).
  useEffect(() => {
    setForm(toFormState(loaded));
  }, [loaded]);

  const errors = useMemo(() => validate(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = useMemo(
    () => JSON.stringify(toValue(form)) !== JSON.stringify(loaded),
    [form, loaded],
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const update = useCallback((key: WeightKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleDiscard = useCallback(() => {
    setForm(toFormState(loaded));
  }, [loaded]);

  const handleSave = useCallback(async () => {
    if (Object.keys(validate(form)).length > 0) return;
    try {
      await save(toValue(form) as unknown as Record<string, unknown>);
      showSuccess(SAVED_MESSAGE);
    } catch (err) {
      showError(toApiError(err).message || 'Failed to save route weights');
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

  const formWeights = toValue(form);

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">Route planning</h3>
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
        <p className="mb-4 max-w-2xl text-sm text-text-secondary">{INTRO}</p>

        <fieldset className="border-0 p-0">
          <legend className="mb-2 block text-sm font-medium text-text-secondary">Route weights</legend>
          <div className="flex max-w-md flex-col gap-4">
            {FIELDS.map(({ key, label, hint, id }) => (
              <FormField key={key} label={label} htmlFor={id} error={errors[key]} hint={hint}>
                <NumberInput
                  id={id}
                  value={form[key]}
                  onChange={(v) => update(key, v)}
                  min={0}
                  max={10}
                  step={0.1}
                  error={!!errors[key]}
                  aria-label={label}
                />
              </FormField>
            ))}
            {errors.group && <p className="text-xs text-error">{errors.group}</p>}
          </div>
        </fieldset>

        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" onClick={handleSave} loading={isSaving} disabled={!dirty || hasErrors}>
            Save changes
          </Button>
          <Button variant="secondary" onClick={handleDiscard} disabled={!dirty || isSaving}>
            Discard changes
          </Button>
        </div>
      </FormSection>

      <RouteWeightsPreview weights={formWeights} weightsValid={!hasErrors} />
    </div>
  );
}
