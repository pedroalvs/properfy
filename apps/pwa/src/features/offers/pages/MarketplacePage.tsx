import { useEffect, useMemo, useRef, useState } from 'react';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { Card } from '@/components/ui/Card';
import { TwoPaneLayout } from '@/components/shell/TwoPaneLayout';
import { OfferFeed } from '../components/OfferFeed';
import { OfferAccordionList } from '../components/OfferAccordionList';
import { OfflineMarketplaceBanner } from '../components/OfflineMarketplaceBanner';
import { GroupDetailBottomSheet } from '../components/GroupDetailBottomSheet';
import { GroupDetailPane } from '../components/GroupDetailPane';
import { OffersViewToggle } from '../components/OffersViewToggle';
import { OffersMapView, type ExpandedGroup } from '../components/OffersMapView';
import { MapGroupActionBar } from '../components/MapGroupActionBar';
import { useMarketplaceOffers } from '../hooks/useMarketplaceOffers';
import { useMarketplaceOfferDetail } from '../hooks/useMarketplaceOfferDetail';
import { useAcceptOffer } from '../hooks/useAcceptOffer';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useIsWide } from '@/hooks/useMediaQuery';
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
  const isWide = useIsWide();
  const {
    offers,
    data,
    isLoading,
    isError,
    error,
    refetch,
    dataUpdatedAt,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    total,
  } = useMarketplaceOffers();
  const { accept, getState } = useAcceptOffer();
  const { showError, showInfo } = useSnackbar();
  const [detailGroupId, setDetailGroupId] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
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

  // Extended (tablet/landscape) layout: the accordion list and the map share one
  // selected id. Toggling an offer open — or tapping its map pin — drives both.
  const handleToggleExpanded = (groupId: string) => {
    setExpandedGroupId((current) => (current === groupId ? null : groupId));
  };

  const handleAcceptGroup = async (groupId: string) => {
    const outcome = await accept(groupId);
    if (outcome !== 'ERROR') setExpandedGroupId(null);
  };

  // Crossing the layout breakpoint (e.g. a tablet rotating between portrait and
  // landscape) starts a fresh selection in BOTH tracks, so neither a wide
  // drill-down reopens in the narrow map view, nor a narrow bottom-sheet
  // selection (`detailGroupId`) pops a stale split-pane over the extended grid.
  useEffect(() => {
    setExpandedGroupId(null);
    setDetailGroupId(null);
  }, [isWide]);

  // Shared detail acceptance, used by both the phone bottom-sheet and the tablet pane.
  const closeDetail = () => setDetailGroupId(null);
  const detailAccepting = detailGroupId ? getState(detailGroupId) === 'ACCEPTING' : false;
  const acceptDetail = detailGroupId
    ? async () => {
        const outcome = await accept(detailGroupId);
        // Keep the detail open on retryable failure so the user can try again.
        if (outcome !== 'ERROR') {
          setDetailGroupId(null);
          setExpandedGroupId(null);
        }
      }
    : undefined;

  // Infinite scroll (list view): fetch the next page when the sentinel enters
  // the viewport — same pattern as the Schedule History tab.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (view !== 'list' || !el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((observed) => {
      if (observed.some((entry) => entry.isIntersecting)) void fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [view, hasNextPage, fetchNextPage, offers.length]);

  // The map (map view, or the always-on map in the extended layout) has no
  // scroll to drive pagination — drain the remaining pages so every offer
  // (including the furthest-dated ones) gets a pin.
  useEffect(() => {
    if (!(view === 'map' || isWide) || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [view, isWide, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const master = (
    <div className="w-full">
      <TopBar title="Offers" size="lg" />

      <div className="px-page-x py-4">
        {/* Compact header: a stacked banner on phone, a single row (count left, guidance right) on
            tablet so it doesn't eat vertical space above the grid. Phone classes are unchanged. */}
        <Card className="bg-primary/5 px-5 py-5 md:flex md:items-center md:justify-between md:gap-6 md:py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Open work</p>
            <h2 className="mt-3 text-xl font-bold tracking-tight text-foreground md:mt-1">
              {total} available {total === 1 ? 'offer' : 'offers'}
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground md:mt-0 md:max-w-xs md:text-right">
            Review grouped inspections and accept only when you can commit to the route.
          </p>
        </Card>
      </div>

      {!isWide && <OffersViewToggle value={view} onChange={handleViewChange} />}

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

      {!isWide && view === 'map' && (
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

      {!isWide && view === 'list' && shouldShowFeed && (
        <PullToRefresh onRefresh={refetch}>
          {dataUpdatedAt > 0 && (
            <p className="px-page-x pt-1 text-xs text-muted-foreground" data-testid="last-updated">
              Last updated {formatTimeAgo(dataUpdatedAt)}
            </p>
          )}
          <OfferFeed offers={offers} onRefresh={refetch} onViewDetail={setDetailGroupId} />
          <div ref={sentinelRef} aria-hidden="true" />
          {isFetchingNextPage && (
            <div className="px-page-x pt-2">
              <LoadingState rows={1} variant="card" />
            </div>
          )}
          {hasNextPage && !isFetchingNextPage && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                className="text-sm font-semibold text-primary"
                data-testid="offers-load-more"
              >
                Load more
              </button>
            </div>
          )}
        </PullToRefresh>
      )}

      {/* Extended layout (tablet/landscape): persistent map + accordion list,
          driven by a single shared selection. */}
      {isWide && shouldShowFeed && (
        <div
          className="grid gap-4 px-page-x py-2 lg:grid-cols-[1fr_minmax(360px,420px)]"
          data-testid="marketplace-extended"
        >
          <div className="self-start lg:sticky lg:top-4">
            <OffersMapView
              offers={offers}
              onSelectOffer={setExpandedGroupId}
              expandedGroup={expandedGroup}
            />
          </div>
          <OfferAccordionList
            offers={offers}
            expandedGroupId={expandedGroupId}
            onToggle={handleToggleExpanded}
            getState={getState}
            onAcceptGroup={handleAcceptGroup}
            onRefresh={refetch}
          />
        </div>
      )}

    </div>
  );

  return (
    <div className="w-full" data-testid="marketplace-page">
      <TwoPaneLayout
        variant="canvas"
        detailMode="overlay"
        hasSelection={detailGroupId !== null}
        onClose={closeDetail}
        showClose={false}
        master={master}
        detail={
          isWide && detailGroupId ? (
            <GroupDetailPane
              groupId={detailGroupId}
              onClose={closeDetail}
              accepting={detailAccepting}
              onAccept={acceptDetail}
            />
          ) : null
        }
      />

      {/* Phone presents the detail as a bottom-sheet overlay; on tablet the inline pane above
          replaces it, so the sheet is suppressed there (gated groupId keeps it closed). */}
      <GroupDetailBottomSheet
        groupId={isWide ? null : detailGroupId}
        onClose={closeDetail}
        accepting={detailAccepting}
        onAccept={acceptDetail}
      />
    </div>
  );
}
