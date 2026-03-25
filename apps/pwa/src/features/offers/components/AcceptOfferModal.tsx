import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/format-date';
import type { MarketplaceOffer, OfferAcceptState } from '../types';

function formatTimeWindow(timeWindow: string): string {
  return timeWindow.replace('-', ' - ');
}

interface AcceptOfferModalProps {
  offer: MarketplaceOffer;
  state: OfferAcceptState;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AcceptOfferModal({ offer, state, onConfirm, onCancel }: AcceptOfferModalProps) {
  if (state !== 'CONFIRMING' && state !== 'ACCEPTING') return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/40" data-testid="accept-modal">
      <div className="w-full max-w-lg rounded-t-2xl bg-card-bg p-6 shadow-xl">
        <h3 className="text-lg font-bold text-secondary">Accept Offer?</h3>

        <div className="mt-4 space-y-2 text-sm text-text-primary">
          <div className="flex justify-between">
            <span className="text-text-secondary">Service</span>
            <span className="font-semibold">{offer.serviceTypeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Date</span>
            <span className="font-semibold">{formatDate(offer.scheduledDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Time</span>
            <span className="font-semibold">{formatTimeWindow(offer.timeWindow)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Inspections</span>
            <span className="font-semibold">{offer.groupSize}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Client</span>
            <span className="font-semibold">{offer.tenantName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Suburbs</span>
            <span className="font-semibold">{offer.suburbs.join(', ') || 'Not informed'}</span>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={state === 'ACCEPTING'}
            className="flex-1"
            data-testid="modal-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            loading={state === 'ACCEPTING'}
            className="flex-1 !bg-success"
            data-testid="modal-confirm"
          >
            Accept Group
          </Button>
        </div>
      </div>
    </div>
  );
}
