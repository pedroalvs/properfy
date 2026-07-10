import { useState } from 'react';
import { IntegrationProvider } from '@properfy/shared';
import type { ApiKeyResponse } from '@properfy/shared';

import { Button } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useIntegrations } from '../hooks/useIntegrations';
import { useApiKeys, useRevokeApiKey } from '../hooks/useApiKeys';
import { PROVIDER_META } from '../providerMeta';
import { IntegrationCard } from './IntegrationCard';
import { CreateApiKeyDialog, FY_SCOPE } from './CreateApiKeyDialog';
import { keyStatus } from './ApiKeysTab';

/**
 * Everything the Fy WhatsApp agent (AutoLabs) needs on our side:
 * 1. Service-account API keys scoped to `bot:fy` (inbound — the bot calls
 *    `/v1/integrations/fy/*` with the X-API-Key header).
 * 2. The FY_WEBHOOK outbound endpoint (Properfy → n8n proactive events).
 */
export function FyAgentTab() {
  const { showError } = useSnackbar();
  const { data: integrations, isLoading, isError, refetch } = useIntegrations();
  const { data: keys, isLoading: keysLoading } = useApiKeys();
  const revokeKey = useRevokeApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyResponse | null>(null);

  const fyMeta = PROVIDER_META.find((meta) => meta.provider === IntegrationProvider.FY_WEBHOOK);
  const fyDetail = integrations?.find((row) => row.provider === IntegrationProvider.FY_WEBHOOK);
  const fyKeys = (keys ?? []).filter((key) => key.scopes.includes(FY_SCOPE));

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeKey.mutateAsync(revokeTarget.id);
      setRevokeTarget(null);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to revoke the API key');
    }
  };

  return (
    <div className="space-y-6">
      <InfoBanner>
        Fy is the WhatsApp assistant (AutoLabs) that answers rental tenants. It calls the dedicated{' '}
        <code className="font-mono text-xs">/v1/integrations/fy</code> API with a{' '}
        <code className="font-mono text-xs">bot:fy</code>-scoped key (60 requests/min), and receives
        proactive events on the webhook endpoint configured below. Full contract:{' '}
        <code className="font-mono text-xs">docs/integrations/fy-agent-api.md</code>.
      </InfoBanner>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-secondary">Service account (inbound API keys)</h2>
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>Create Fy API key</Button>
        </div>
        {keysLoading && <LoadingState />}
        {!keysLoading && fyKeys.length === 0 && (
          <EmptyState
            icon="mdi-robot-outline"
            title="No Fy API keys"
            description="Create a bot:fy scoped key and hand it to AutoLabs — it is the only credential the agent can use."
          />
        )}
        {fyKeys.length > 0 && (
          <div className="overflow-x-auto rounded bg-card-bg shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs text-text-secondary">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Key prefix</th>
                  <th className="px-4 py-3 font-medium">Last used</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {fyKeys.map((key) => {
                  const status = keyStatus(key);
                  return (
                    <tr key={key.id} className="border-b border-black/5 last:border-b-0">
                      <td className="px-4 py-3">{key.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{key.prefix}…</td>
                      <td className="px-4 py-3">
                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : '—'}
                      </td>
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
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-secondary">Outbound webhook (proactive events)</h2>
        {isLoading && <LoadingState />}
        {isError && (
          <ErrorState message="Failed to load integrations" onRetry={() => void refetch()} />
        )}
        {fyMeta && fyDetail && <IntegrationCard meta={fyMeta} detail={fyDetail} />}
        <p className="text-xs text-text-secondary">
          Properfy POSTs <code className="font-mono">inspector.accepted</code> and{' '}
          <code className="font-mono">appointment.status_changed</code> to this URL with the{' '}
          <code className="font-mono">X-Webhook-Secret</code> header. Failed deliveries retry 5
          times with backoff.
        </p>
      </section>

      <CreateApiKeyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        presetScopes={[FY_SCOPE]}
        defaultName="Fy agent (AutoLabs)"
      />

      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Revoke Fy API key"
        confirmLabel="Revoke"
        variant="danger"
        loading={revokeKey.isPending}
        message={
          <p>
            Revoke <strong>{revokeTarget?.name}</strong> ({revokeTarget?.prefix}…)? The Fy agent
            stops working immediately. This cannot be undone.
          </p>
        }
      />
    </div>
  );
}
