import { useState } from 'react';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { OfferFeed } from '../components/OfferFeed';
import { OfflineMarketplaceBanner } from '../components/OfflineMarketplaceBanner';
import { GroupDetailBottomSheet } from '../components/GroupDetailBottomSheet';
import { OffersViewToggle } from '../components/OffersViewToggle';
import { OffersMapView } from '../components/OffersMapView';
import { useMarketplaceOffers } from '../hooks/useMarketplaceOffers';
import { useAcceptOffer } from '../hooks/useAcceptOffer';
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
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useMarketplaceOffers();
  const { accept, getState } = useAcceptOffer();
  const [detailGroupId, setDetailGroupId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const offers = data?.data ?? [];
  const hasCachedOffers = offers.length > 0;
  const shouldShowFeed = !isLoading && (!isError || hasCachedOffers);

  return (
    <div className="w-full" data-testid="marketplace-page">
      <TopBar title="Marketplace" />

      <div className="px-page-x py-4">
        <section className="rounded-[28px] border border-primary/10 bg-[linear-gradient(135deg,_rgba(239,246,255,0.96),_rgba(224,231,255,0.92))] px-5 py-5 shadow-[0_16px_38px_rgba(37,99,235,0.10)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">Open work</p>
          <h2 className="mt-3 text-xl font-bold tracking-tight text-secondary">
            {offers.length} available {offers.length === 1 ? 'offer' : 'offers'}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Review grouped inspections and accept only when you can commit to the route.
          </p>
        </section>
      </div>

      <OffersViewToggle value={view} onChange={setView} />

      {!isOnline && <OfflineMarketplaceBanner />}

      {isOnline && isLoading && (
        <div className="px-page-x py-2">
          <LoadingState rows={4} variant="card" />
        </div>
      )}

      {isOnline && isError && !hasCachedOffers && (
        <ErrorState
          message="Failed to load offers"
          detail={error instanceof Error ? error.message : undefined}
          onRetry={refetch}
        />
      )}

      {view === 'map' && (
        <div className="px-page-x py-2">
          <OffersMapView offers={offers} onSelectOffer={setDetailGroupId} />
        </div>
      )}

      {view === 'list' && shouldShowFeed && (
        <PullToRefresh onRefresh={refetch}>
          {dataUpdatedAt > 0 && (
            <p className="px-page-x pt-1 text-xs text-text-muted" data-testid="last-updated">
              Last updated {formatTimeAgo(dataUpdatedAt)}
            </p>
          )}
          <OfferFeed offers={offers} onRefresh={refetch} onViewDetail={setDetailGroupId} />
        </PullToRefresh>
      )}

      <GroupDetailBottomSheet
        groupId={detailGroupId}
        onClose={() => setDetailGroupId(null)}
        accepting={detailGroupId ? getState(detailGroupId) === 'ACCEPTING' : false}
        onAccept={
          detailGroupId
            ? async () => {
                const outcome = await accept(detailGroupId);
                // Keep the sheet open on retryable failure so the user can try again
                if (outcome !== 'ERROR') setDetailGroupId(null);
              }
            : undefined
        }
      />
    </div>
  );
}
