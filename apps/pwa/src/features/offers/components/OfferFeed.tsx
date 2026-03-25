import { useState } from 'react';
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
}

export function OfferFeed({ offers, onRefresh }: OfferFeedProps) {
  const { getState, startConfirm, cancelConfirm, accept } = useAcceptOffer();
  const [selectedOffer, setSelectedOffer] = useState<MarketplaceOffer | null>(null);
  const isOnline = useIsOnline();
  const { showError } = useSnackbar();

  if (!offers || offers.length === 0) {
    return (
      <EmptyState
        title="No offers available"
        description="Check back later for new inspection offers"
        icon="mdi-tag-off-outline"
        action={{ label: 'Refresh', onClick: onRefresh }}
      />
    );
  }

  const sorted = [...(offers ?? [])].sort((a, b) => {
    const aState = getState(a.groupId);
    const bState = getState(b.groupId);
    const aResolved = ['ACCEPTED', 'CONFLICT', 'GONE'].includes(aState);
    const bResolved = ['ACCEPTED', 'CONFLICT', 'GONE'].includes(bState);
    if (aResolved !== bResolved) return aResolved ? 1 : -1;
    return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
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
      <div className="flex flex-col gap-3 px-page-x py-4">
        {sorted.map((offer) => (
          <OfferCard
            key={offer.groupId}
            offer={offer}
            state={getState(offer.groupId)}
            onAccept={() => handleAcceptClick(offer)}
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
