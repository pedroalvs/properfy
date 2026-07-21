import { useState } from 'react';
import type { ApiKeyResponse } from '@properfy/shared';

import { Button } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useApiKeys, useRevokeApiKey } from '../hooks/useApiKeys';
import { CreateApiKeyDialog } from './CreateApiKeyDialog';

export function keyStatus(key: ApiKeyResponse): { label: string; className: string } {
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
  const revokeKey = useRevokeApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyResponse | null>(null);

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
        API keys let the Fy agent call the Properfy API using the{' '}
        <code className="font-mono text-xs">X-API-Key</code> header. Every key is created with the{' '}
        <code className="font-mono text-xs">bot:fy</code> scope and only reaches the Fy agent
        surface.
      </InfoBanner>

      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>New Fy key</Button>
      </div>

      {!keys || keys.length === 0 ? (
        <EmptyState
          icon="mdi-key-outline"
          title="No API keys"
          description="Create a key to allow the Fy agent to call the Properfy API."
        />
      ) : (
        <div className="overflow-x-auto rounded bg-card-bg shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs text-text-secondary">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key prefix</th>
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
                    <td className="px-4 py-3">{formatDate(key.expiresAt)}</td>
                    <td className="px-4 py-3">{formatDate(key.lastUsedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!key.revokedAt && (
                        <Button
                          variant="outlined"
                          aria-label={`Revoke ${key.name}`}
                          onClick={() => setRevokeTarget(key)}
                        >
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

      <CreateApiKeyDialog open={createOpen} onClose={() => setCreateOpen(false)} />

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
