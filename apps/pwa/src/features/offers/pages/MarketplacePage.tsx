import { useEffect, useMemo, useState } from 'react';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { OfferFeed } from '../components/OfferFeed';
import { OfflineMarketplaceBanner } from '../components/OfflineMarketplaceBanner';
import { GroupDetailBottomSheet } from '../components/GroupDetailBottomSheet';
import { OffersViewToggle } from '../components/OffersViewToggle';
import { OffersMapView, type ExpandedGroup } from '../components/OffersMapView';
import { MapGroupActionBar } from '../components/MapGroupActionBar';
import { useMarketplaceOffers } from '../hooks/useMarketplaceOffers';
import { useMarketplaceOfferDetail } from '../hooks/useMarketplaceOfferDetail';
import { useAcceptOffer } from '../hooks/useAcceptOffer';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useSnackbar } from '@/hooks/useSnackbar';

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
  const { showError, showInfo } = useSnackbar();
  const [detailGroupId, setDetailGroupId] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const offers = data?.data ?? [];
  const hasCachedOffers = offers.length > 0;
  const shouldShowFeed = !isLoading && (!isError || hasCachedOffers);

  const expandedDetail = useMarketplaceOfferDetail(expandedGroupId);
  const expandedOffer = expandedGroupId
    ? offers.find((offer) => offer.groupId === expandedGroupId) ?? null
    : null;

  const expandedGroup = useMemo<ExpandedGroup | null>(() => {
    if (!expandedGroupId || !expandedDetail.data) return null;
    return {
      groupId: expandedGroupId,
      appointments: expandedDetail.data.appointments.map((appointment) => ({
        id: appointment.id,
        street: appointment.street,
        suburb: appointment.suburb,
        timeSlotStart: appointment.timeSlotStart,
        timeSlotEnd: appointment.timeSlotEnd,
        coordinates: appointment.coordinates,
      })),
    };
  }, [expandedGroupId, expandedDetail.data]);

  // Drill-down needs the detail fetch; without it there are no pins to show.
  useEffect(() => {
    if (!expandedGroupId || !expandedDetail.isError) return;
    showError('Failed to load group inspections');
    setExpandedGroupId(null);
  }, [expandedGroupId, expandedDetail.isError, showError]);

  // The expanded group can vanish from the periodically refetched offers list
  // (accepted by another inspector or unpublished) — reset instead of showing
  // pins for an offer that no longer exists.
  useEffect(() => {
    if (!expandedGroupId || isLoading || isError || !data) return;
    if (!offers.some((offer) => offer.groupId === expandedGroupId)) {
      showInfo('This group is no longer available');
      setExpandedGroupId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedGroupId, data, isLoading, isError, showInfo]);

  const handleViewChange = (nextView: 'list' | 'map') => {
    if (nextView === 'list') setExpandedGroupId(null);
    setView(nextView);
  };

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

      <OffersViewToggle value={view} onChange={handleViewChange} />

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
        <div className="flex flex-col gap-2 px-page-x py-2">
          {expandedGroupId && (
            <MapGroupActionBar
              groupCode={expandedOffer?.code ?? expandedDetail.data?.code ?? ''}
              appointmentCount={
                expandedDetail.data?.appointmentCount ?? expandedOffer?.appointmentCount ?? 0
              }
              loading={expandedDetail.isLoading}
              onReset={() => setExpandedGroupId(null)}
              onAccept={() => setDetailGroupId(expandedGroupId)}
            />
          )}
          <OffersMapView
            offers={offers}
            onSelectOffer={setExpandedGroupId}
            expandedGroup={expandedGroup}
          />
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
                if (outcome !== 'ERROR') {
                  setDetailGroupId(null);
                  setExpandedGroupId(null);
                }
              }
            : undefined
        }
      />
    </div>
  );
}
