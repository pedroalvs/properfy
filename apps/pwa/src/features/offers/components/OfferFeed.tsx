import { useState } from 'react';
import { Tag } from 'lucide-react';
import { OfferCard } from './OfferCard';
import { AcceptOfferModal } from './AcceptOfferModal';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { MarketplaceOffer } from '../types';
import { useAcceptOffer } from '../hooks/useAcceptOffer';

interface OfferFeedProps {
  offers: MarketplaceOffer[] | undefined;
  onRefresh: () => void;
  onViewDetail?: (groupId: string) => void;
}

export function OfferFeed({ offers, onRefresh, onViewDetail }: OfferFeedProps) {
  const { getState, startConfirm, cancelConfirm, accept } = useAcceptOffer();
  const [selectedOffer, setSelectedOffer] = useState<MarketplaceOffer | null>(null);
  const isOnline = useIsOnline();
  const { showError } = useSnackbar();

  if (!offers || offers.length === 0) {
    return (
      <EmptyState
        title="No offers available"
        description="Check back later for new inspection offers"
        icon={Tag}
        action={{ label: 'Refresh', onClick: onRefresh }}
      />
    );
  }

  // `offers` is guaranteed non-empty here (the early return above handles empty/
  // undefined). `toSorted` would be cleaner but the PWA tsconfig targets ES2022.
  const sorted = [...offers].sort((a, b) => {
    const aState = getState(a.groupId);
    const bState = getState(b.groupId);
    const aResolved = ['ACCEPTED', 'CONFLICT', 'GONE'].includes(aState);
    const bResolved = ['ACCEPTED', 'CONFLICT', 'GONE'].includes(bState);
    if (aResolved !== bResolved) return aResolved ? 1 : -1;
    return a.scheduledDate.localeCompare(b.scheduledDate);
  });

  const handleAcceptClick = (offer: MarketplaceOffer) => {
    if (!isOnline) {
      showError('You need to be connected to accept offers');
      return;
    }
    setSelectedOffer(offer);
    startConfirm(offer.groupId);
  };

  const handleConfirm = () => {
    if (selectedOffer) {
      accept(selectedOffer.groupId);
      setSelectedOffer(null);
    }
  };

  const handleCancel = () => {
    if (selectedOffer) {
      cancelConfirm(selectedOffer.groupId);
      setSelectedOffer(null);
    }
  };

  return (
    <div data-testid="offer-feed">
      {/* Fluid card grid: the minmax template is driven by the actual container width, so it is a
          single column on a phone (and inside a narrow master rail) and reflows to 2–3 columns as the
          Offers pane widens on tablet — no viewport breakpoint needed. */}
      <div className="grid gap-3 px-page-x py-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]" data-testid="offer-grid">
        {sorted.map((offer) => (
          <OfferCard
            key={offer.groupId}
            offer={offer}
            state={getState(offer.groupId)}
            onAccept={() => handleAcceptClick(offer)}
            onViewDetail={onViewDetail ? () => onViewDetail(offer.groupId) : undefined}
          />
        ))}
      </div>

      {selectedOffer && (
        <AcceptOfferModal
          offer={selectedOffer}
          state={getState(selectedOffer.groupId)}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
