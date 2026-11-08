import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  RELIABILITY_METRIC_KEYS,
  resolvePlatformSettingValue,
  getFieldErrors,
  type ReliabilityIndexSetting,
  type ReliabilityMetricKey,
} from '@properfy/shared';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { NumberInput } from '@/components/forms/NumberInput';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useSnackbar } from '@/hooks/useSnackbar';
import { toApiError } from '@/lib/api-error';
import { formatInstantDateTime } from '@/lib/format-date';
import { metricLabel } from '@/features/inspector-performance/lib/format-metric';
import { usePlatformSetting } from '../hooks/usePlatformSetting';

const SAVED_MESSAGE = 'Reliability settings saved. Scores are being recalculated.';
const NO_ACCESS_MESSAGE = "You don't have access to platform settings";
const GENERIC_SAVE_ERROR = "We couldn't save these settings. Try again.";
const WEIGHT_ERROR = 'Enter a whole number from 0 to 10';
const GROUP_ERROR = 'Set at least one weight above 0';
const MIN_VOLUME_ERROR = 'Enter a whole number from 1 to 200';
const OVERRIDE_ERROR = 'Enter a whole number from 1 to 1000, or leave it empty';
const MIN_RATINGS_ERROR = 'Enter a whole number from 1 to 50';

const INTRO =
  'Weights decide how much each metric counts in the inspector score. Changes apply to today’s scores within a few minutes.';

interface FormState {
  weights: Record<ReliabilityMetricKey, string>;
  minimumVolume: string;
  volumeReferenceOverride: string;
  minimumRatings: string;
}

function toFormState(value: ReliabilityIndexSetting): FormState {
  const weights = {} as Record<ReliabilityMetricKey, string>;
  for (const key of RELIABILITY_METRIC_KEYS) weights[key] = String(value.weights[key]);
  return {
    weights,
    minimumVolume: String(value.minimumVolume),
    volumeReferenceOverride: value.volumeReferenceOverride === null ? '' : String(value.volumeReferenceOverride),
    minimumRatings: String(value.minimumRatings),
  };
}

function isWholeInt(raw: string, min: number, max: number): boolean {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const value = Number(trimmed);
  return value >= min && value <= max;
}

type FieldErrors = Partial<Record<ReliabilityMetricKey | 'minimumVolume' | 'volumeReferenceOverride' | 'minimumRatings' | 'group', string>>;

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  for (const key of RELIABILITY_METRIC_KEYS) {
    if (!isWholeInt(form.weights[key], 0, 10)) errors[key] = WEIGHT_ERROR;
  }
  const allWeightsValid = RELIABILITY_METRIC_KEYS.every((key) => !errors[key]);
  if (allWeightsValid && RELIABILITY_METRIC_KEYS.every((key) => Number(form.weights[key]) === 0)) {
    errors.group = GROUP_ERROR;
  }
  if (!isWholeInt(form.minimumVolume, 1, 200)) errors.minimumVolume = MIN_VOLUME_ERROR;
  if (form.volumeReferenceOverride.trim() !== '' && !isWholeInt(form.volumeReferenceOverride, 1, 1000)) {
    errors.volumeReferenceOverride = OVERRIDE_ERROR;
  }
  if (!isWholeInt(form.minimumRatings, 1, 50)) errors.minimumRatings = MIN_RATINGS_ERROR;
  return errors;
}

function toValue(form: FormState): ReliabilityIndexSetting {
  const weights = {} as ReliabilityIndexSetting['weights'];
  for (const key of RELIABILITY_METRIC_KEYS) weights[key] = Number(form.weights[key]);
  return {
    weights,
    minimumVolume: Number(form.minimumVolume),
    volumeReferenceOverride: form.volumeReferenceOverride.trim() === '' ? null : Number(form.volumeReferenceOverride),
    minimumRatings: Number(form.minimumRatings),
  };
}

export interface ReliabilityIndexSectionProps {
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * "Reliability index" section of Platform settings (03.A1). Reads/writes the
 * `reliabilityIndex` key (AM and OP — L-F07-11) via the generic `usePlatformSetting`
 * hook; on save it additionally invalidates `['reliability']` so the ranking
 * refetches once the backend recompute lands.
 */
export function ReliabilityIndexSection({ onDirtyChange }: ReliabilityIndexSectionProps) {
  const { setting, isLoading, isError, error, refetch, save, isSaving } = usePlatformSetting('reliabilityIndex');
  const { showSuccess, showError } = useSnackbar();
  const queryClient = useQueryClient();

  const loaded = useMemo<ReliabilityIndexSetting>(
    () => resolvePlatformSettingValue('reliabilityIndex', setting?.value).value as ReliabilityIndexSetting,
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
  const dirty = useMemo(() => JSON.stringify(toValue(form)) !== JSON.stringify(loaded), [form, loaded]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const updateWeight = useCallback((key: ReliabilityMetricKey, value: string) => {
    setForm((prev) => ({ ...prev, weights: { ...prev.weights, [key]: value } }));
    setServerErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const updateField = useCallback((key: 'minimumVolume' | 'volumeReferenceOverride' | 'minimumRatings', value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setServerErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const handleSave = useCallback(async () => {
    if (Object.keys(validate(form)).length > 0) return;
    try {
      await save(toValue(form) as unknown as Record<string, unknown>);
      queryClient.invalidateQueries({ queryKey: ['reliability'] });
      showSuccess(SAVED_MESSAGE);
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setServerErrors(fieldErrors as FieldErrors);
      } else {
        showError(toApiError(err).message || GENERIC_SAVE_ERROR);
      }
    }
  }, [form, save, queryClient, showSuccess, showError]);

  if (isLoading) {
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm" id="reliability-index">
        <LoadingState rows={4} variant="card" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm" id="reliability-index">
        <ErrorState
          message={error?.status === 403 ? NO_ACCESS_MESSAGE : "Couldn't load platform settings"}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm" id="reliability-index">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">Reliability index</h3>
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
        <p className="mb-4 max-w-2xl text-sm text-text-secondary">{INTRO}</p>

        <fieldset className="border-0 p-0">
          <legend className="mb-2 block text-sm font-medium text-text-secondary">Metric weights</legend>
          <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
            {RELIABILITY_METRIC_KEYS.map((key) => {
              const id = `reliability-weight-${key}`;
              return (
                <FormField key={key} label={metricLabel(key)} htmlFor={id} error={errors[key]}>
                  <NumberInput
                    id={id}
                    value={form.weights[key]}
                    onChange={(v) => updateWeight(key, v)}
                    min={0}
                    max={10}
                    step={1}
                    error={!!errors[key]}
                    aria-label={`${metricLabel(key)} weight`}
                  />
                </FormField>
              );
            })}
          </div>
          {errors.group && <p className="mt-2 text-xs text-error">{errors.group}</p>}
        </fieldset>

        <div className="mt-6 flex max-w-md flex-col gap-4">
          <FormField
            label="Minimum services to be ranked"
            htmlFor="reliability-min-volume"
            error={errors.minimumVolume}
            hint="Inspectors below this number show as Not enough data."
          >
            <NumberInput
              id="reliability-min-volume"
              value={form.minimumVolume}
              onChange={(v) => updateField('minimumVolume', v)}
              min={1}
              max={200}
              step={1}
              error={!!errors.minimumVolume}
              aria-label="Minimum services to be ranked"
            />
          </FormField>

          <FormField
            label="Fixed volume reference (optional)"
            htmlFor="reliability-override"
            error={errors.volumeReferenceOverride}
            hint="Leave empty to use the median completed volume of active inspectors, recalculated every night. Enter a number to use a fixed 30-day reference instead (scaled for shorter or longer goal periods)."
          >
            <NumberInput
              id="reliability-override"
              value={form.volumeReferenceOverride}
              onChange={(v) => updateField('volumeReferenceOverride', v)}
              min={1}
              max={1000}
              step={1}
              error={!!errors.volumeReferenceOverride}
              aria-label="Fixed volume reference (optional)"
            />
          </FormField>

          <FormField
            label="Minimum ratings for satisfaction"
            htmlFor="reliability-min-ratings"
            error={errors.minimumRatings}
            hint="With fewer tenant ratings than this, satisfaction doesn't count in the score."
          >
            <NumberInput
              id="reliability-min-ratings"
              value={form.minimumRatings}
              onChange={(v) => updateField('minimumRatings', v)}
              min={1}
              max={50}
              step={1}
              error={!!errors.minimumRatings}
              aria-label="Minimum ratings for satisfaction"
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
