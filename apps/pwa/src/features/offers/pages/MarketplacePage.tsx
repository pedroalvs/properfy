import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { OfferFeed } from '../components/OfferFeed';
import { OfflineMarketplaceBanner } from '../components/OfflineMarketplaceBanner';
import { useMarketplaceOffers } from '../hooks/useMarketplaceOffers';
import { useIsOnline } from '@/hooks/useIsOnline';

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function MarketplacePage() {
  const isOnline = useIsOnline();
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useMarketplaceOffers();
  const offers = data?.data ?? [];

  return (
    <div data-testid="marketplace-page">
      <TopBar title="Marketplace" />

      {!isOnline && <OfflineMarketplaceBanner />}

      {isOnline && isLoading && (
        <div className="px-page-x py-4">
          <LoadingState rows={4} variant="card" />
        </div>
      )}

      {isOnline && isError && (
        <ErrorState message="Failed to load offers" onRetry={refetch} />
      )}

      {isOnline && !isLoading && !isError && (
        <PullToRefresh onRefresh={refetch}>
          {dataUpdatedAt > 0 && (
            <p className="px-page-x pt-2 text-xs text-text-muted" data-testid="last-updated">
              Last updated {formatTimeAgo(dataUpdatedAt)}
            </p>
          )}
          <OfferFeed offers={offers} onRefresh={refetch} />
        </PullToRefresh>
      )}
    </div>
  );
}
