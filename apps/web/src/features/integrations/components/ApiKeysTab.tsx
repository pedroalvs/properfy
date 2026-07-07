import { useState } from 'react';
import type { ApiKeyCreated, ApiKeyResponse, ApiKeyRole } from '@properfy/shared';

import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TextInput } from '@/components/forms/TextInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { DateInput } from '@/components/forms/DateInput';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { SecretValue } from '@/features/apps/components/SecretValue';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../hooks/useApiKeys';

const ROLE_OPTIONS = [
  { value: 'OP', label: 'Operator (OP)' },
  { value: 'AM', label: 'Admin Master (AM)' },
];

function keyStatus(key: ApiKeyResponse): { label: string; className: string } {
  if (key.revokedAt) return { label: 'Revoked', className: 'bg-error/10 text-error' };
  if (key.expiresAt && new Date(key.expiresAt) <= new Date()) {
    return { label: 'Expired', className: 'bg-warning/10 text-warning' };
  }
  return { label: 'Active', className: 'bg-success/10 text-success' };
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : '—';
}

/**
 * Inbound API keys for external systems (n8n / AI automations) calling the
 * Properfy API with the X-API-Key header. The plaintext key is shown exactly
 * once after creation.
 */
export function ApiKeysTab() {
  const { showError } = useSnackbar();
  const { data: keys, isLoading } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<ApiKeyRole>('OP');
  const [expiresAt, setExpiresAt] = useState('');
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyResponse | null>(null);

  const resetCreateForm = () => {
    setName('');
    setRole('OP');
    setExpiresAt('');
  };

  const handleCreate = async () => {
    try {
      const created = await createKey.mutateAsync({
        name: name.trim(),
        role,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59.999Z`).toISOString() : null,
      });
      setCreateOpen(false);
      resetCreateForm();
      setCreatedKey(created);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to create the API key');
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeKey.mutateAsync(revokeTarget.id);
      setRevokeTarget(null);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to revoke the API key');
    }
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <InfoBanner>
        API keys let external systems (e.g. n8n automations) call the Properfy API using the{' '}
        <code className="font-mono text-xs">X-API-Key</code> header. Each key acts with the role it
        was created with.
      </InfoBanner>

      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>New API key</Button>
      </div>

      {!keys || keys.length === 0 ? (
        <EmptyState
          icon="mdi-key-outline"
          title="No API keys"
          description="Create a key to allow an external system to call the Properfy API."
        />
      ) : (
        <div className="overflow-x-auto rounded bg-card-bg shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs text-text-secondary">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key prefix</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Last used</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const status = keyStatus(key);
                return (
                  <tr key={key.id} className="border-b border-black/5 last:border-b-0">
                    <td className="px-4 py-3">{key.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{key.prefix}…</td>
                    <td className="px-4 py-3">{key.role}</td>
                    <td className="px-4 py-3">{formatDate(key.expiresAt)}</td>
                    <td className="px-4 py-3">{formatDate(key.lastUsedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!key.revokedAt && (
                        <Button variant="outlined" onClick={() => setRevokeTarget(key)}>
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New API key"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={createKey.isPending} disabled={!name.trim()}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-text-secondary">Name</span>
            <TextInput value={name} onChange={setName} placeholder="e.g. n8n automation" aria-label="API key name" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-text-secondary">Role</span>
            <SelectInput
              value={role}
              onChange={(value) => setRole(value as ApiKeyRole)}
              options={ROLE_OPTIONS}
              aria-label="API key role"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-text-secondary">
              Expiry date (optional)
            </span>
            <DateInput value={expiresAt} onChange={setExpiresAt} aria-label="API key expiry date" />
          </label>
        </div>
      </Dialog>

      <Dialog
        open={createdKey !== null}
        onClose={() => setCreatedKey(null)}
        title="API key created"
        actions={<Button onClick={() => setCreatedKey(null)}>Done</Button>}
      >
        {createdKey && (
          <div className="space-y-3">
            <p className="text-sm">
              Copy the key now — <strong>it will not be shown again</strong>.
            </p>
            <div className="rounded bg-black/5 px-3 py-2">
              <SecretValue value={createdKey.key} maskable label="API key" />
            </div>
            <p className="text-xs text-muted">
              Send it in the <code className="font-mono">X-API-Key</code> header on every request.
            </p>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Revoke API key"
        confirmLabel="Revoke"
        variant="danger"
        loading={revokeKey.isPending}
        message={
          <p>
            Revoke <strong>{revokeTarget?.name}</strong> ({revokeTarget?.prefix}…)? Any system using
            this key stops working immediately. This cannot be undone.
          </p>
        }
      />
    </div>
  );
}
