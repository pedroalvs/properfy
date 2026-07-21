import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { TabsNav } from '@/components/layout/TabsNav';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { getErrorMessage } from '@/lib/api-error';
import { useIntegrations } from '../hooks/useIntegrations';
import { useApiKeys } from '../hooks/useApiKeys';
import { PROVIDER_META } from '../providerMeta';
import { IntegrationTile } from '../components/IntegrationTile';
import { ProviderLogo } from '../components/ProviderLogo';
import { keyStatus } from '../components/ApiKeysTab';
import { isFyKey } from '../components/fyKey';
import { sourceBadge } from '../components/sourceBadge';

const TABS = [
  { id: 'integrations', label: 'Integrations' },
  { id: 'api-keys', label: 'API Keys' },
];

/**
 * AM-only hub: each integration is a tile linking to its own page.
 * Tab 1 lists the outbound providers (Resend / MobileMessage / Mapbox / Fy
 * webhook); tab 2 holds the single inbound surface — the Fy agent API keys.
 * The active tab lives in the URL (?tab=api-keys) so detail pages can link back.
 */
export function IntegrationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'api-keys' ? 'api-keys' : 'integrations';
  const { data: integrations, isLoading, isError, error, refetch } = useIntegrations();
  const { data: apiKeys, isLoading: keysLoading, isError: keysError } = useApiKeys();

  // Legacy unscoped keys are not Fy keys — never count them on the Fy tile.
  const activeKeyCount = (apiKeys ?? []).filter(
    (key) => isFyKey(key) && keyStatus(key).label === 'Active',
  ).length;

  const fyTileCaption = keysLoading
    ? 'Loading keys…'
    : keysError
      ? 'Key count unavailable'
      : activeKeyCount === 1
        ? '1 active key'
        : `${activeKeyCount} active keys`;

  const fyTileBadge = keysLoading
    ? { label: 'Loading', className: 'bg-info/10 text-info' }
    : keysError
      ? { label: 'Unknown', className: 'bg-warning/10 text-warning' }
      : activeKeyCount > 0
        ? { label: 'Active', className: 'bg-success/10 text-success' }
        : { label: 'No active keys', className: 'bg-warning/10 text-warning' };

  const handleTabChange = (tabId: string) => {
    setSearchParams(tabId === 'api-keys' ? { tab: 'api-keys' } : {}, { replace: true });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Integrations" />
      <TabsNav tabs={TABS} activeTab={activeTab} onChange={handleTabChange} />

      {activeTab === 'integrations' && (
        <>
          {isLoading && <LoadingState />}
          {isError && (
            <ErrorState
              message="Failed to load integrations"
              detail={getErrorMessage(error)}
              onRetry={() => void refetch()}
            />
          )}
          {integrations && integrations.length === 0 && (
            <EmptyState
              icon="mdi-connection"
              title="No integrations"
              description="The API returned no integrations to configure."
            />
          )}
          {integrations && integrations.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {PROVIDER_META.map((meta) => {
                const detail = integrations.find((row) => row.provider === meta.provider);
                return detail ? (
                  <IntegrationTile
                    key={meta.provider}
                    to={`/integrations/${meta.slug}`}
                    name={meta.label}
                    caption={meta.affectedCapability}
                    badge={sourceBadge(detail)}
                    logo={<ProviderLogo logoKey={meta.provider} brandColor={meta.brandColor} />}
                  />
                ) : null;
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'api-keys' && (
        <div className="space-y-4">
          <InfoBanner>
            Inbound API access is restricted to the Fy agent — every key carries the{' '}
            <code className="font-mono text-xs">bot:fy</code> scope. Open the Fy integration to
            create and manage keys.
          </InfoBanner>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <IntegrationTile
              to="/integrations/fy-api"
              name="Fy Integration"
              caption={fyTileCaption}
              badge={fyTileBadge}
              logo={<ProviderLogo logoKey="fy_webhook" brandColor="#25D366" />}
            />
          </div>
        </div>
      )}
    </div>
  );
}
