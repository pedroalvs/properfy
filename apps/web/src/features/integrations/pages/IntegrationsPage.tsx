import { useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { TabsNav } from '@/components/layout/TabsNav';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useIntegrations } from '../hooks/useIntegrations';
import { PROVIDER_META } from '../providerMeta';
import { IntegrationCard } from '../components/IntegrationCard';
import { ApiKeysTab } from '../components/ApiKeysTab';

const TABS = [
  { id: 'integrations', label: 'Integrations' },
  { id: 'api-keys', label: 'API Keys' },
];

/**
 * AM-only hub: tab 1 manages the platform's outbound integration credentials
 * (Resend / MobileMessage / Mapbox — database config over env fallback);
 * tab 2 manages inbound API keys for external systems (n8n / AI).
 */
export function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState('integrations');
  const { data: integrations, isLoading, isError, refetch } = useIntegrations();

  return (
    <div className="space-y-4">
      <PageHeader title="Integrations" />
      <TabsNav tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'integrations' && (
        <>
          {isLoading && <LoadingState />}
          {isError && (
            <ErrorState message="Failed to load integrations" onRetry={() => void refetch()} />
          )}
          {integrations && (
            <div className="space-y-4">
              {PROVIDER_META.map((meta) => {
                const detail = integrations.find((row) => row.provider === meta.provider);
                return detail ? (
                  <IntegrationCard key={meta.provider} meta={meta} detail={detail} />
                ) : null;
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'api-keys' && <ApiKeysTab />}
    </div>
  );
}
