import { PriorityMode } from '@properfy/shared';
import type { MarketplaceOffer } from '../types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/feedback/EmptyState';

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

  const isPriority = offer.priorityMode === PriorityMode.PRIORITY_24H;
  const badgeBg = isPriority ? 'bg-[#FFF3E0] text-[#E65100]' : 'bg-[#E3F2FD] text-[#1565C0]';
  const badgeLabel = isPriority ? '24h Priority' : 'Standard';

  const formattedPayout = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(offer.totalPayout);

  const expiresDate = new Date(offer.expiresAt).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="border-t border-gray-200 p-4" data-testid="offer-detail-panel">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-secondary">{offer.groupName}</h3>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeBg}`}>
          {badgeLabel}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <span className="text-text-muted text-xs">Region</span>
          <p className="font-medium text-text-primary">{offer.regionName}</p>
        </div>
        <div>
          <span className="text-text-muted text-xs">Total Payout</span>
          <p className="font-medium text-text-primary">{formattedPayout}</p>
        </div>
        <div>
          <span className="text-text-muted text-xs">Expires</span>
          <p className="font-medium text-text-primary">{expiresDate}</p>
        </div>
      </div>

      {offer.appointments.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">
            Appointments ({offer.appointments.length})
          </h4>
          <div className="max-h-48 overflow-y-auto rounded border border-gray-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-[#FAFAFA]">
                  <th className="px-2 py-1.5 text-left font-bold text-text-secondary">Code</th>
                  <th className="px-2 py-1.5 text-left font-bold text-text-secondary">Address</th>
                  <th className="px-2 py-1.5 text-left font-bold text-text-secondary">Date</th>
                  <th className="px-2 py-1.5 text-left font-bold text-text-secondary">Time</th>
                </tr>
              </thead>
              <tbody>
                {offer.appointments.map((apt) => (
                  <tr key={apt.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-2 py-1.5 font-medium text-text-primary">{apt.code}</td>
                    <td className="px-2 py-1.5 text-text-secondary" title={apt.address}>
                      <span className="line-clamp-1">{apt.address}</span>
                    </td>
                    <td className="px-2 py-1.5 text-text-primary">
                      {new Date(apt.scheduledDate).toLocaleDateString('en-AU', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </td>
                    <td className="px-2 py-1.5 text-text-primary">{apt.timeSlot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {offer.appointments.length === 0 && (
        <div className="mb-4 rounded bg-[#FAFAFA] p-3 text-center text-xs text-text-muted">
          No appointments in this offer.
        </div>
      )}

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
