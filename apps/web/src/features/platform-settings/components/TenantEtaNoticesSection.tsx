import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@properfy/frontend-standards';
import { formatWallTime, getFieldErrors, resolvePlatformSettingValue } from '@properfy/shared';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { NumberInput } from '@/components/forms/NumberInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useSnackbar } from '@/hooks/useSnackbar';
import { toApiError } from '@/lib/api-error';
import { formatInstantDateTime } from '@/lib/format-date';
import { usePlatformSetting } from '../hooks/usePlatformSetting';

const SAVED_MESSAGE = 'Settings saved';
const NO_ACCESS_MESSAGE = "You don't have access to platform settings";
const CUTOFF_ERROR = 'Must be after the morning notice hour';
const THRESHOLD_ERROR = 'Enter a number between 5 and 120';
const BUDGET_ERROR = 'Enter a number between 10 and 100';
const RANGE_NOTE = 'Estimates are shown as a 1-hour range (±30 minutes), limited to the booked window.';

const CHANNEL_OPTIONS = [
  { value: 'BOTH', label: 'SMS and email' },
  { value: 'SMS_ELSE_EMAIL', label: 'SMS, or email when there is no phone' },
];
const hourOptions = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => ({
    value: String(h),
    label: formatWallTime(`${h}:00`),
  }));
const MORNING_HOUR_OPTIONS = hourOptions(5, 11);
const CUTOFF_HOUR_OPTIONS = hourOptions(6, 12);

const FIELD_IDS = {
  delayThresholdMinutes: 'tenant-eta-delay-threshold',
  smsBudgetSharePercent: 'tenant-eta-sms-budget',
} as const;

interface LoadedValue {
  enabled: boolean;
  channelMode: string;
  morningHour: number;
  morningCutoffHour: number;
  delayThresholdMinutes: number;
  smsBudgetSharePercent: number;
}

interface FormState {
  enabled: boolean;
  channelMode: string;
  morningHour: string;
  morningCutoffHour: string;
  delayThresholdMinutes: string;
  smsBudgetSharePercent: string;
}

function toFormState(v: LoadedValue): FormState {
  return {
    enabled: v.enabled,
    channelMode: v.channelMode,
    morningHour: String(v.morningHour),
    morningCutoffHour: String(v.morningCutoffHour),
    delayThresholdMinutes: String(v.delayThresholdMinutes),
    smsBudgetSharePercent: String(v.smsBudgetSharePercent),
  };
}

function parseIntStrict(raw: string): number | null {
  return /^-?\d+$/.test(raw.trim()) ? Number(raw) : null;
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const threshold = parseIntStrict(form.delayThresholdMinutes);
  if (threshold == null || threshold < 5 || threshold > 120) errors.delayThresholdMinutes = THRESHOLD_ERROR;
  const budget = parseIntStrict(form.smsBudgetSharePercent);
  if (budget == null || budget < 10 || budget > 100) errors.smsBudgetSharePercent = BUDGET_ERROR;
  if (Number(form.morningCutoffHour) <= Number(form.morningHour)) errors.morningCutoffHour = CUTOFF_ERROR;
  return errors;
}

function toValue(form: FormState): Record<string, unknown> {
  return {
    enabled: form.enabled,
    channelMode: form.channelMode,
    morningHour: Number(form.morningHour),
    morningCutoffHour: Number(form.morningCutoffHour),
    delayThresholdMinutes: Number(form.delayThresholdMinutes),
    smsBudgetSharePercent: Number(form.smsBudgetSharePercent),
  };
}

interface TenantEtaNoticesSectionProps {
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * "Tenant arrival notices" section of Platform settings (F06, AM/OP). Reads and
 * writes the `tenantEtaNotices` key through the generic `usePlatformSetting`
 * hook; the full key object is replaced on save (last-write-wins).
 */
export function TenantEtaNoticesSection({ onDirtyChange }: TenantEtaNoticesSectionProps) {
  const { setting, isLoading, isError, error, refetch, save, isSaving } = usePlatformSetting('tenantEtaNotices');
  const { showSuccess, showError } = useSnackbar();

  const loaded = useMemo<LoadedValue>(
    () => resolvePlatformSettingValue('tenantEtaNotices', setting?.value).value as LoadedValue,
    [setting],
  );
  const heading = setting?.section ?? 'Tenant arrival notices';

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
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const errorFor = (field: keyof FormState): string | undefined => serverErrors[field] ?? clientErrors[field];
  const update = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setServerErrors({});
  }, []);

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
      } else {
        showError(toApiError(err).message || 'Failed to save settings');
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
        <ErrorState message={forbidden ? NO_ACCESS_MESSAGE : "Couldn't load platform settings"} onRetry={refetch} />
      </div>
    );
  }

  const hasErrors = Object.keys(clientErrors).length > 0;

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">{heading}</h3>
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
          <div className="flex items-center justify-between">
            <span id="tenant-eta-enabled-label" className="text-sm font-medium text-text-secondary">
              Send arrival notices to rental tenants
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              aria-labelledby="tenant-eta-enabled-label"
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

          <FormField label="Channels" htmlFor="tenant-eta-channel">
            <SelectInput
              id="tenant-eta-channel"
              value={form.channelMode}
              onChange={(v) => update({ channelMode: v })}
              options={CHANNEL_OPTIONS}
              aria-label="Channels"
            />
          </FormField>

          <FormField label="Morning notice at" htmlFor="tenant-eta-morning-hour">
            <SelectInput
              id="tenant-eta-morning-hour"
              value={form.morningHour}
              onChange={(v) => update({ morningHour: v })}
              options={MORNING_HOUR_OPTIONS}
              aria-label="Morning notice at"
            />
          </FormField>

          <FormField
            label="Don't send the morning notice after"
            htmlFor="tenant-eta-cutoff-hour"
            error={errorFor('morningCutoffHour')}
          >
            <SelectInput
              id="tenant-eta-cutoff-hour"
              value={form.morningCutoffHour}
              onChange={(v) => update({ morningCutoffHour: v })}
              options={CUTOFF_HOUR_OPTIONS}
              aria-label="Don't send the morning notice after"
            />
          </FormField>

          <FormField
            label="Running-late threshold (minutes after the booked window ends)"
            htmlFor={FIELD_IDS.delayThresholdMinutes}
            error={errorFor('delayThresholdMinutes')}
          >
            <NumberInput
              id={FIELD_IDS.delayThresholdMinutes}
              value={form.delayThresholdMinutes}
              onChange={(v) => update({ delayThresholdMinutes: v })}
              min={5}
              max={120}
              error={!!errorFor('delayThresholdMinutes')}
              aria-label="Running-late threshold"
            />
          </FormField>

          <FormField
            label="Stop arrival SMS at (% of the agency's daily SMS limit)"
            htmlFor={FIELD_IDS.smsBudgetSharePercent}
            error={errorFor('smsBudgetSharePercent')}
            hint="The rest is kept for mandatory notices. Emails keep going."
          >
            <NumberInput
              id={FIELD_IDS.smsBudgetSharePercent}
              value={form.smsBudgetSharePercent}
              onChange={(v) => update({ smsBudgetSharePercent: v })}
              min={10}
              max={100}
              error={!!errorFor('smsBudgetSharePercent')}
              aria-label="Stop arrival SMS at"
            />
          </FormField>

          <p className="text-xs text-text-muted">{RANGE_NOTE}</p>

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={handleSave} loading={isSaving} disabled={!dirty || hasErrors}>
              Save
            </Button>
          </div>
        </div>
      </FormSection>
    </div>
  );
}
