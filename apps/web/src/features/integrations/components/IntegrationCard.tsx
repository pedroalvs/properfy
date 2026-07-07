import { useState } from 'react';
import type { IntegrationDetail, IntegrationTestResult } from '@properfy/shared';

import { Button } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TextInput } from '@/components/forms/TextInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { ProviderMeta } from '../providerMeta';
import {
  useDeleteIntegration,
  useTestIntegration,
  useUpsertIntegration,
} from '../hooks/useIntegrations';

interface IntegrationCardProps {
  meta: ProviderMeta;
  detail: IntegrationDetail;
}

function sourceBadge(detail: IntegrationDetail) {
  if (!detail.enabled) {
    return { label: 'Disabled', className: 'bg-warning/10 text-warning' };
  }
  if (detail.source === 'database') {
    return { label: 'Configured (hub)', className: 'bg-success/10 text-success' };
  }
  if (detail.source === 'env') {
    return { label: 'Configured (environment)', className: 'bg-info/10 text-info' };
  }
  return { label: 'Not configured', className: 'bg-error/10 text-error' };
}

/**
 * One managed outbound integration. Secret fields are write-only: inputs
 * start empty and an empty input means "keep the saved value" — the masked
 * placeholder shows what is currently stored.
 */
export function IntegrationCard({ meta, detail }: IntegrationCardProps) {
  const { showSuccess, showError } = useSnackbar();
  const upsert = useUpsertIntegration();
  const remove = useDeleteIntegration();
  const test = useTestIntegration();

  const [values, setValues] = useState<Record<string, string>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [testResult, setTestResult] = useState<IntegrationTestResult | null>(null);

  const badge = sourceBadge(detail);
  const dirty = Object.values(values).some((value) => value.trim() !== '');

  const handleSave = async () => {
    const config = Object.fromEntries(
      Object.entries(values)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value !== ''),
    );
    try {
      await upsert.mutateAsync({ provider: meta.provider, config });
      setValues({});
      setTestResult(null);
      showSuccess(`${meta.label} settings saved`);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to save the integration');
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await test.mutateAsync(meta.provider);
      setTestResult(result);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Connection test failed');
    }
  };

  const handleRemove = async () => {
    try {
      await remove.mutateAsync(meta.provider);
      setConfirmRemove(false);
      setValues({});
      setTestResult(null);
      showSuccess(`${meta.label} database settings removed`);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to remove the integration');
    }
  };

  return (
    <section className="rounded bg-card-bg p-6 shadow-sm" aria-label={meta.label}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <i className={`mdi ${meta.icon} text-2xl text-text-secondary`} aria-hidden="true" />
          <div>
            <h2 className="text-base font-medium">{meta.label}</h2>
            <p className="text-xs text-muted">{meta.affectedCapability}</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {meta.fields.map((field) => {
          const saved = detail.maskedConfig[field.key] ?? null;
          return (
            <label key={field.key} className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-text-secondary">{field.label}</span>
              <TextInput
                value={values[field.key] ?? ''}
                onChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
                type={field.secret ? 'password' : 'text'}
                placeholder={saved ?? field.placeholder ?? ''}
                aria-label={`${meta.label} ${field.label}`}
              />
              {field.secret && saved && (
                <span className="mt-1 block text-xs text-muted">
                  Saved value kept when left empty
                </span>
              )}
            </label>
          );
        })}
      </div>

      {testResult && (
        <p
          className={`mt-3 text-sm ${testResult.ok ? 'text-success' : 'text-error'}`}
          role="status"
        >
          <i
            className={`mdi ${testResult.ok ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'} mr-1`}
            aria-hidden="true"
          />
          {testResult.message}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={handleSave} loading={upsert.isPending} disabled={!dirty}>
          Save
        </Button>
        <Button variant="secondary" onClick={handleTest} loading={test.isPending} disabled={!detail.configured}>
          Test connection
        </Button>
        {detail.source === 'database' && (
          <Button variant="outlined" onClick={() => setConfirmRemove(true)}>
            Remove
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={handleRemove}
        title={`Remove ${meta.label} settings`}
        confirmLabel="Remove"
        variant="warning"
        loading={remove.isPending}
        message={
          <p>
            Remove the {meta.label} credentials stored in the hub? The platform falls back to the
            environment configuration when present, otherwise {meta.affectedCapability.toLowerCase()}{' '}
            stops working until it is configured again.
          </p>
        }
      />
    </section>
  );
}
