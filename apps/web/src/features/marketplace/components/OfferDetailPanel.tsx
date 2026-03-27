import type { MarketplaceOffer } from '../types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatDate } from '@/lib/format-date';

interface OfferDetailPanelProps {
  offer: MarketplaceOffer | null;
  onAccept: (groupId: string) => void;
  isAccepting: boolean;
}

export function OfferDetailPanel({ offer, onAccept, isAccepting }: OfferDetailPanelProps) {
  if (!offer) {
    return (
      <div data-testid="offer-detail-panel-empty">
        <EmptyState
          title="No offer selected"
          description="Select an offer from the list to view its details."
          icon="mdi-package-variant"
        />
      </div>
    );
  }

  const isPriority = offer.priorityMode === 'PRIORITY_24H';
  const badgeBg = isPriority ? 'bg-[#FFF3E0] text-[#E65100]' : 'bg-[#E3F2FD] text-[#1565C0]';
  const badgeLabel = isPriority ? '24h Priority' : 'Standard';

  return (
    <div className="border-t border-gray-200 p-4" data-testid="offer-detail-panel">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-bold text-secondary">{offer.serviceTypeName}</h3>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeBg}`}>
          {badgeLabel}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <span className="text-text-muted text-xs">Client</span>
          <p className="font-medium text-text-primary">{offer.tenantName}</p>
        </div>
        <div>
          <span className="text-text-muted text-xs">Inspections</span>
          <p className="font-medium text-text-primary">{offer.groupSize}</p>
        </div>
        <div>
          <span className="text-text-muted text-xs">Date</span>
          <p className="font-medium text-text-primary">{formatDate(offer.scheduledDate)}</p>
        </div>
      </div>

      <div className="mb-4 rounded bg-[#FAFAFA] p-3 text-sm text-text-primary">
        <p><span className="text-text-muted">Time window:</span> {offer.timeWindow}</p>
        <p><span className="text-text-muted">Priority expires:</span> {offer.priorityExpiresAt ? formatDate(offer.priorityExpiresAt) : 'Standard availability'}</p>
        <p><span className="text-text-muted">Suburbs:</span> {offer.suburbs.length > 0 ? offer.suburbs.join(', ') : 'Not informed'}</p>
      </div>

      <Button
        variant="primary"
        className="w-full"
        onClick={() => onAccept(offer.groupId)}
        loading={isAccepting}
      >
        <i className="mdi mdi-check-bold" aria-hidden="true" />
        Accept Offer
      </Button>
    </div>
  );
}
