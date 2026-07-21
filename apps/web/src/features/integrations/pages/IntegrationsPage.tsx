import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { TabsNav } from '@/components/layout/TabsNav';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { getErrorMessage } from '@/lib/api-error';
import { useIntegrations } from '../hooks/useIntegrations';
import { useApiKeys } from '../hooks/useApiKeys';
import { PROVIDER_META } from '../providerMeta';
import { IntegrationTile } from '../components/IntegrationTile';
import { ProviderLogo } from '../components/ProviderLogo';
import { keyStatus } from '../components/ApiKeysTab';
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
  const { data: apiKeys } = useApiKeys();

  const activeKeyCount = (apiKeys ?? []).filter((key) => keyStatus(key).label === 'Active').length;

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
          {integrations && (
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
              caption={
                activeKeyCount === 1 ? '1 active key' : `${activeKeyCount} active keys`
              }
              badge={
                activeKeyCount > 0
                  ? { label: 'Active', className: 'bg-success/10 text-success' }
                  : { label: 'No active keys', className: 'bg-warning/10 text-warning' }
              }
              logo={<ProviderLogo logoKey="fy_webhook" brandColor="#25D366" />}
            />
          </div>
        </div>
      )}
    </div>
  );
}
