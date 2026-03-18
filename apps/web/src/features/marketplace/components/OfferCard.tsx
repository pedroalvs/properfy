import { PriorityMode } from '@properfy/shared';
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
  const isPriority = offer.priorityMode === PriorityMode.PRIORITY_24H;

  const borderColor = selected
    ? 'border-secondary'
    : isPriority
      ? 'border-[#FF9800]'
      : 'border-primary';

  const badgeBg = isPriority ? 'bg-[#FFF3E0] text-[#E65100]' : 'bg-[#E3F2FD] text-[#1565C0]';
  const badgeLabel = isPriority ? '24h Priority' : 'Standard';

  const formattedPayout = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(offer.totalPayout);

  const expiresDate = formatDate(offer.expiresAt);

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
          <h3 className="text-sm font-bold text-text-primary">{offer.groupName}</h3>
          <p className="text-xs text-text-secondary">{offer.regionName}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeBg}`} data-testid="priority-badge">
          {badgeLabel}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-text-muted">Appointments</span>
          <p className="font-semibold text-text-primary">{offer.appointmentsCount}</p>
        </div>
        <div>
          <span className="text-text-muted">Payout</span>
          <p className="font-semibold text-text-primary">{formattedPayout}</p>
        </div>
        <div className="col-span-2">
          <span className="text-text-muted">Expires</span>
          <p className="font-semibold text-text-primary">{expiresDate}</p>
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
