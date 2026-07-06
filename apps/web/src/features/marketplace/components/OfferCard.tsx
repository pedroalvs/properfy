import type { MarketplaceOffer } from '../types';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/format-date';

interface OfferCardProps {
  offer: MarketplaceOffer;
  selected: boolean;
  onClick: () => void;
  onAccept: () => void;
}

export function OfferCard({ offer, selected, onClick, onAccept }: OfferCardProps) {
  const borderColor = selected
    ? 'border-secondary'
    : 'border-primary';

  return (
    <div
      className={`cursor-pointer rounded border-l-4 bg-card-bg p-4 shadow-sm transition-all hover:shadow-md ${borderColor} ${
        selected ? 'ring-2 ring-secondary/30' : ''
      }`}
      onClick={onClick}
      data-testid="offer-card"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-selected={selected}
    >
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-text-primary">
            {offer.serviceTypeName}
            {offer.code ? <span className="ml-2 font-mono text-xs text-text-muted">#{offer.code}</span> : null}
          </h3>
          <p className="text-xs text-text-secondary">{offer.tenantName}</p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-text-muted">Inspections</span>
          <p className="font-semibold text-text-primary">{offer.groupSize}</p>
        </div>
        <div>
          <span className="text-text-muted">Date</span>
          <p className="font-semibold text-text-primary">{formatDate(offer.scheduledDate)}</p>
        </div>
        <div className="col-span-2">
          <span className="text-text-muted">Time window</span>
          <p className="font-semibold text-text-primary">{offer.timeWindow}</p>
        </div>
        <div className="col-span-2">
          <span className="text-text-muted">Suburbs</span>
          <p className="font-semibold text-text-primary">
            {offer.suburbs.length > 0 ? offer.suburbs.join(', ') : 'Not informed'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          className="flex-1 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onAccept();
          }}
        >
          <i className="mdi mdi-check" aria-hidden="true" />
          Accept
        </Button>
        <Button
          variant="outlined"
          className="flex-1 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <i className="mdi mdi-eye-outline" aria-hidden="true" />
          View
        </Button>
      </div>
    </div>
  );
}
