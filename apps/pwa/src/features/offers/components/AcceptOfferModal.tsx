import { Button } from '@/components/ui/Button';
import { formatCivilDate } from '@/lib/format-date';
import { formatCurrency } from '@/lib/format-currency';
import type { MarketplaceOffer, OfferAcceptState } from '../types';

function formatTimeWindow(timeWindow: string): string {
  return timeWindow.replace('-', ' – ');
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
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50" data-testid="accept-modal">
      <div className="w-full max-w-lg rounded-t-3xl bg-white shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-black/10" />
        </div>

        <div className="px-6 pb-8 pt-3">
          <h3 className="text-lg font-bold text-secondary">Confirm acceptance</h3>
          <p className="mt-0.5 text-sm text-text-secondary">
            Once accepted, these inspections are assigned to you.
          </p>

          {/* Summary details */}
          <div className="mt-4 space-y-2.5 text-sm">
            <Row label="Service" value={offer.serviceTypeName} />
            <Row label="Agency" value={offer.tenantName} />
            <Row label="Date" value={formatCivilDate(offer.scheduledDate)} />
            <Row label="Time window" value={formatTimeWindow(offer.timeWindow)} />
            <Row
              label="Inspections"
              value={`${offer.appointmentCount} ${offer.appointmentCount === 1 ? 'inspection' : 'inspections'}`}
            />
            {offer.suburbs.length > 0 && (
              <Row label="Area" value={offer.suburbs.join(', ')} />
            )}
          </div>

          {/* Payout highlight */}
          {offer.payoutEstimate != null && (
            <div className="mt-4 rounded-xl bg-success/8 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-success">Estimated payout</span>
              <span className="text-xl font-bold text-success" data-testid="modal-payout">
                {formatCurrency(offer.payoutEstimate)}
              </span>
            </div>
          )}

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
              className="flex-1 !bg-success !font-bold"
              data-testid="modal-confirm"
            >
              Accept
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-text-secondary shrink-0">{label}</span>
      <span className="font-semibold text-text-primary text-right">{value}</span>
    </div>
  );
}
