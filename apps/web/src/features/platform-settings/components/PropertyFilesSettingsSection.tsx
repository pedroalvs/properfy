import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@properfy/frontend-standards';
import {
  getFieldErrors,
  resolvePlatformSettingValue,
  type PropertyFilesSetting,
} from '@properfy/shared';
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

const SAVED_MESSAGE = 'Settings saved';
const NO_ACCESS_MESSAGE = "You don't have access to platform settings";

const MIME_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG image',
  'image/png': 'PNG image',
  'image/heic': 'HEIC image',
  'image/webp': 'WebP image',
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (.docx)',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (.xlsx)',
};
const ALL_MIME_VALUES = Object.keys(MIME_LABELS);
const IMAGE_MIME_VALUES = ALL_MIME_VALUES.filter((m) => m.startsWith('image/'));
const mimeLabel = (m: string) => MIME_LABELS[m] ?? m;

/** Catalog options ∪ any stored value not in the catalog (so a custom MIME is never dropped). */
function mimeOptions(catalog: string[], selected: string[]): string[] {
  const extras = selected.filter((m) => !catalog.includes(m));
  return [...catalog, ...extras];
}

interface FormState {
  allowedMimes: string[];
  maxFileSizeMb: string;
  issueImageMimes: string[];
  maxPhotosPerIssue: string;
  retentionEnabled: boolean;
  retentionDays: string;
  deletedRetentionDays: string;
}

function toFormState(v: PropertyFilesSetting): FormState {
  return {
    allowedMimes: v.allowedMimes,
    maxFileSizeMb: String(v.maxFileSizeMb),
    issueImageMimes: v.issueImageMimes,
    maxPhotosPerIssue: String(v.maxPhotosPerIssue),
    retentionEnabled: v.retentionDays != null,
    retentionDays: v.retentionDays != null ? String(v.retentionDays) : '',
    deletedRetentionDays: String(v.deletedRetentionDays),
  };
}

function parseIntStrict(raw: string): number | null {
  return /^-?\d+$/.test(raw.trim()) ? Number(raw) : null;
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (form.allowedMimes.length === 0) errors.allowedMimes = 'Select at least one file type';
  if (form.issueImageMimes.length === 0) errors.issueImageMimes = 'Select at least one image type';
  const size = parseIntStrict(form.maxFileSizeMb);
  if (size == null || size < 5 || size > 200) errors.maxFileSizeMb = 'Enter a number between 5 and 200';
  const photos = parseIntStrict(form.maxPhotosPerIssue);
  if (photos == null || photos < 1 || photos > 20) errors.maxPhotosPerIssue = 'Enter a number between 1 and 20';
  if (form.retentionEnabled) {
    const days = parseIntStrict(form.retentionDays);
    if (days == null || days < 1) errors.retentionDays = 'Enter a number of days (1 or more)';
  }
  const del = parseIntStrict(form.deletedRetentionDays);
  if (del == null || del < 30 || del > 3650) errors.deletedRetentionDays = 'Enter a number between 30 and 3650';
  return errors;
}

function toValue(form: FormState): Record<string, unknown> {
  return {
    allowedMimes: form.allowedMimes,
    maxFileSizeMb: Number(form.maxFileSizeMb),
    issueImageMimes: form.issueImageMimes,
    maxPhotosPerIssue: Number(form.maxPhotosPerIssue),
    retentionDays: form.retentionEnabled ? Number(form.retentionDays) : null,
    deletedRetentionDays: Number(form.deletedRetentionDays),
  };
}

function toggle(list: string[], value: string, checked: boolean): string[] {
  return checked ? [...new Set([...list, value])] : list.filter((v) => v !== value);
}

interface PropertyFilesSettingsSectionProps {
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * "Property files" section of Platform settings (F10, AM/OP). Reads/writes the
 * `propertyFiles` key through the generic `usePlatformSetting` hook; the full key
 * object is replaced on save (last-write-wins).
 */
export function PropertyFilesSettingsSection({ onDirtyChange }: PropertyFilesSettingsSectionProps) {
  const { setting, isLoading, isError, error, refetch, save, isSaving } = usePlatformSetting('propertyFiles');
  const { showSuccess, showError } = useSnackbar();

  const loaded = useMemo<PropertyFilesSetting>(
    () => resolvePlatformSettingValue('propertyFiles', setting?.value).value as PropertyFilesSetting,
    [setting],
  );
  const heading = setting?.section ?? 'Property files';

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
      if (Object.keys(fieldErrors).length > 0) setServerErrors(fieldErrors);
      else showError(toApiError(err).message || 'Failed to save settings');
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
  const allowedOptions = mimeOptions(ALL_MIME_VALUES, form.allowedMimes);
  const imageOptions = mimeOptions(IMAGE_MIME_VALUES, form.issueImageMimes);

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
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-text-secondary">
              Allowed file types (documents, reports, other)
            </legend>
            <div className="flex flex-col gap-1">
              {allowedOptions.map((m) => (
                <Checkbox
                  key={m}
                  label={mimeLabel(m)}
                  checked={form.allowedMimes.includes(m)}
                  onChange={(checked) => update({ allowedMimes: toggle(form.allowedMimes, m, checked) })}
                />
              ))}
            </div>
            {errorFor('allowedMimes') && (
              <p className="mt-1 text-xs text-error">{errorFor('allowedMimes')}</p>
            )}
          </fieldset>

          <FormField label="Max file size (MB)" htmlFor="pf-max-size" error={errorFor('maxFileSizeMb')}>
            <NumberInput
              id="pf-max-size"
              value={form.maxFileSizeMb}
              onChange={(v) => update({ maxFileSizeMb: v })}
              min={5}
              max={200}
              error={!!errorFor('maxFileSizeMb')}
              aria-label="Max file size in MB"
            />
          </FormField>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-text-secondary">
              Allowed issue photo types
            </legend>
            <div className="flex flex-col gap-1">
              {imageOptions.map((m) => (
                <Checkbox
                  key={m}
                  label={mimeLabel(m)}
                  checked={form.issueImageMimes.includes(m)}
                  onChange={(checked) => update({ issueImageMimes: toggle(form.issueImageMimes, m, checked) })}
                />
              ))}
            </div>
            {errorFor('issueImageMimes') && (
              <p className="mt-1 text-xs text-error">{errorFor('issueImageMimes')}</p>
            )}
          </fieldset>

          <FormField label="Max photos per issue" htmlFor="pf-max-photos" error={errorFor('maxPhotosPerIssue')}>
            <NumberInput
              id="pf-max-photos"
              value={form.maxPhotosPerIssue}
              onChange={(v) => update({ maxPhotosPerIssue: v })}
              min={1}
              max={20}
              error={!!errorFor('maxPhotosPerIssue')}
              aria-label="Max photos per issue"
            />
          </FormField>

          <div>
            <div className="flex items-center justify-between">
              <span id="pf-retention-label" className="text-sm font-medium text-text-secondary">
                Keep active files forever
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={!form.retentionEnabled}
                aria-labelledby="pf-retention-label"
                onClick={() => update({ retentionEnabled: !form.retentionEnabled })}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  !form.retentionEnabled ? 'bg-primary' : 'bg-text-disabled',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 transform rounded-full bg-card-bg transition-transform',
                    !form.retentionEnabled ? 'translate-x-5' : 'translate-x-1',
                  )}
                />
              </button>
            </div>
            {form.retentionEnabled && (
              <FormField
                label="Delete active files after (days)"
                htmlFor="pf-retention-days"
                error={errorFor('retentionDays')}
                className="mt-2"
              >
                <NumberInput
                  id="pf-retention-days"
                  value={form.retentionDays}
                  onChange={(v) => update({ retentionDays: v })}
                  min={1}
                  error={!!errorFor('retentionDays')}
                  aria-label="Delete active files after days"
                />
              </FormField>
            )}
          </div>

          <FormField
            label="Purge deleted files from storage after (days)"
            htmlFor="pf-deleted-retention"
            error={errorFor('deletedRetentionDays')}
          >
            <NumberInput
              id="pf-deleted-retention"
              value={form.deletedRetentionDays}
              onChange={(v) => update({ deletedRetentionDays: v })}
              min={30}
              max={3650}
              error={!!errorFor('deletedRetentionDays')}
              aria-label="Purge deleted files after days"
            />
          </FormField>

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
