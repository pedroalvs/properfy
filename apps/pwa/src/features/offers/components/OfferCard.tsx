import { memo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { formatDate, toLocalISODate } from '@/lib/format-date';
import type { MarketplaceOffer, OfferAcceptState } from '../types';

interface OfferCardProps {
  offer: MarketplaceOffer;
  state: OfferAcceptState;
  onAccept: () => void;
}

function isToday(dateStr: string): boolean {
  const today = toLocalISODate(new Date());
  return dateStr === today;
}

function formatTimeWindow(timeWindow: string): string {
  return timeWindow.replace('-', ' - ');
}

const stateLabels: Partial<Record<OfferAcceptState, { label: string; className: string }>> = {
  ACCEPTED: { label: 'Accepted', className: 'bg-success/10 text-success' },
  CONFLICT: { label: 'Already taken', className: 'bg-warning/10 text-warning' },
  GONE: { label: 'No longer available', className: 'bg-text-muted/10 text-text-muted' },
  ERROR: { label: 'Try again', className: 'bg-error/10 text-error' },
};

export const OfferCard = memo(function OfferCard({ offer, state, onAccept }: OfferCardProps) {
  const today = isToday(offer.scheduledDate);
  const resolved = stateLabels[state];
  const [expanded, setExpanded] = useState(false);
  const [faded, setFaded] = useState(false);

  useEffect(() => {
    if (state === 'ACCEPTED') {
      const timer = setTimeout(() => setFaded(true), 3000);
      return () => clearTimeout(timer);
    }
    setFaded(false);
  }, [state]);

  return (
    <div
      className={`rounded-lg bg-card-bg p-4 shadow-sm transition-opacity duration-500 ${faded ? 'opacity-50' : ''}`}
      data-testid={`offer-card-${offer.groupId}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-text-primary">{offer.serviceTypeName}</span>
            {today && (
              <span className="rounded bg-warning px-1.5 py-0.5 text-[10px] font-bold text-white" data-testid="today-badge">
                TODAY
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-text-secondary">
            {formatDate(offer.scheduledDate)} | {formatTimeWindow(offer.timeWindow)}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">{offer.tenantName}</p>
        </div>
        <span className="text-sm font-bold text-primary">
          {offer.groupSize} {offer.groupSize === 1 ? 'inspection' : 'inspections'}
        </span>
      </div>

      <p className="mt-2 text-sm text-text-primary">
        {offer.suburbs.length > 0 ? offer.suburbs.join(', ') : 'Suburbs not informed'}
      </p>
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span data-testid="priority-expiration">
          {offer.priorityExpiresAt ? `Priority until ${formatDate(offer.priorityExpiresAt)}` : 'Standard availability'}
        </span>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary"
        data-testid="expand-details-button"
      >
        Details
        <i className={`mdi ${expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'}`} />
      </button>

      {expanded && (
        <div className="mt-2 rounded bg-app-bg p-3" data-testid="offer-details-expanded">
          <p className="mb-1 text-xs font-bold uppercase text-text-secondary">Suburbs</p>
          <ul className="list-disc pl-4 text-xs text-text-primary">
            {offer.suburbs.map((suburb) => (
              <li key={suburb}>{suburb}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">
        {resolved ? (
          <div
            className={`rounded px-3 py-2 text-center text-sm font-semibold ${resolved.className}`}
            data-testid="offer-state-label"
            role="alert"
          >
            {resolved.label}
          </div>
        ) : (
          <Button
            variant="primary"
            onClick={onAccept}
            loading={state === 'ACCEPTING'}
            disabled={state === 'ACCEPTING' || state === 'CONFIRMING'}
            className="!w-full !bg-success !min-h-touch"
            data-testid="accept-button"
          >
            Accept
          </Button>
        )}
      </div>
    </div>
  );
});
