import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MapScreenLayout } from '@/components/map/MapScreenLayout';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/ui/Button';
import { useMarketplaceOffers } from '../hooks/useMarketplaceOffers';
import { useMarketplaceOfferDetail } from '../hooks/useMarketplaceOfferDetail';
import { useOfferAccept } from '../hooks/useOfferAccept';
import { OfferCard } from '../components/OfferCard';
import { OfferDetailPanel } from '../components/OfferDetailPanel';

export function MarketplacePage() {
  const {
    data: offers,
    isLoading,
    isError,
    refetch,
  } = useMarketplaceOffers();

  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [confirmGroupId, setConfirmGroupId] = useState<string | null>(null);

  const { accept, isAccepting } = useOfferAccept(() => {
    setConfirmGroupId(null);
    setSelectedOfferId(null);
  });

  const selectedOffer = offers.find((o) => o.groupId === selectedOfferId) ?? null;
  const { detail: selectedDetail, isLoading: isDetailLoading } = useMarketplaceOfferDetail(selectedOfferId);

  const handleAcceptClick = (groupId: string) => {
    setConfirmGroupId(groupId);
  };

  const handleConfirmAccept = () => {
    if (confirmGroupId) {
      accept(confirmGroupId);
    }
  };

  const handleCancelConfirm = () => {
    setConfirmGroupId(null);
  };

  const sidePanel = (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading && <LoadingState rows={4} variant="card" />}

        {isError && (
          <ErrorState
            message="Failed to load marketplace offers."
            onRetry={refetch}
          />
        )}

        {!isLoading && !isError && offers.length === 0 && (
          <EmptyState
            title="No offers available"
            description="Check back later for new marketplace offers."
            icon="mdi-store-outline"
          />
        )}

        {!isLoading && !isError && offers.length > 0 && (
          <div className="flex flex-col gap-3" data-testid="offer-list">
            {offers.map((offer) => (
              <OfferCard
                key={offer.groupId}
                offer={offer}
                selected={offer.groupId === selectedOfferId}
                onClick={() => setSelectedOfferId(offer.groupId === selectedOfferId ? null : offer.groupId)}
                onAccept={() => handleAcceptClick(offer.groupId)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedOffer && (
        <div className="flex-shrink-0">
          <OfferDetailPanel
            offer={selectedOffer}
            detail={selectedDetail}
            detailLoading={isDetailLoading}
            onAccept={handleAcceptClick}
            isAccepting={isAccepting}
          />
        </div>
      )}
    </div>
  );

  const mapContent = (
    <div
      className="flex h-full items-center justify-center rounded-xl border border-dashed border-border-subtle bg-app-bg px-6 text-center"
      data-testid="marketplace-map-panel"
    >
      <div className="max-w-sm text-text-muted">
        <i className="mdi mdi-map-marker-question-outline text-4xl" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-text-primary">
          {selectedOffer ? 'Exact coordinates are only revealed after offer acceptance.' : 'Select an offer to view its summary.'}
        </p>
        <p className="mt-2 text-sm">
          {selectedOffer ? 'This protects the property location before assignment is confirmed.' : 'Offer locations are intentionally hidden until there is an accepted assignment.'}
        </p>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Marketplace" />

      <MapScreenLayout
        sidePanel={sidePanel}
        map={mapContent}
        sidePanelWidth="400px"
      />

      {/* Confirm Accept Dialog */}
      {confirmGroupId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          data-testid="confirm-dialog-overlay"
        >
          <div className="w-full max-w-sm rounded-lg bg-card-bg p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-secondary">Accept Offer?</h3>
            <p className="mb-6 text-sm text-text-secondary">
              Are you sure you want to accept this offer? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={handleCancelConfirm}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmAccept} loading={isAccepting}>
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
