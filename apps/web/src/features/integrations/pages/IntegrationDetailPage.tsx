import { useParams } from 'react-router-dom';

import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { getErrorMessage } from '@/lib/api-error';
import { useGoBack } from '@/hooks/useGoBack';
import { useIntegrations } from '../hooks/useIntegrations';
import { findProviderMetaBySlug } from '../providerMeta';
import { IntegrationCard } from '../components/IntegrationCard';

/** Own page of one outbound integration, at /integrations/<slug>. AM-only (guarded in the router). */
export function IntegrationDetailPage() {
  const { provider: slug } = useParams();
  const goBack = useGoBack('/integrations');
  const meta = findProviderMetaBySlug(slug);
  const { data: integrations, isLoading, isError, error, refetch } = useIntegrations();

  const detail = meta ? integrations?.find((row) => row.provider === meta.provider) : undefined;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={goBack}
        className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <i className="mdi mdi-arrow-left" aria-hidden="true" />
        Integrations
      </button>

      {!meta && (
        <EmptyState
          icon="mdi-connection"
          title="Integration not found"
          description="This integration does not exist. Pick one from the Integrations hub."
        />
      )}

      {meta && isLoading && <LoadingState />}
      {meta && isError && (
        <ErrorState
          message="Failed to load the integration"
          detail={getErrorMessage(error)}
          onRetry={() => void refetch()}
        />
      )}
      {meta && detail && <IntegrationCard meta={meta} detail={detail} />}
    </div>
  );
}
