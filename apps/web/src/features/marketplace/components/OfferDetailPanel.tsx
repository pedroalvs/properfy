import type { MarketplaceOffer, MarketplaceOfferDetail } from '../types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatDate } from '@/lib/format-date';

interface OfferDetailPanelProps {
  offer: MarketplaceOffer | null;
  /** Per-appointment breakdown (incl. each job's agency); fetched lazily on select. */
  detail?: MarketplaceOfferDetail | null;
  detailLoading?: boolean;
  onAccept: (groupId: string) => void;
  isAccepting: boolean;
}

function formatPayout(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function OfferDetailPanel({ offer, detail, detailLoading, onAccept, isAccepting }: OfferDetailPanelProps) {
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

      {detailLoading && (
        <p className="mb-4 text-sm text-text-muted" data-testid="offer-detail-loading">Loading inspections…</p>
      )}

      {detail && detail.appointments.length > 0 && (
        <div className="mb-4" data-testid="offer-appointment-list">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Inspections ({detail.appointments.length})
          </span>
          <ul className="divide-y divide-gray-100 rounded border border-gray-100">
            {detail.appointments.map((appt) => (
              <li key={appt.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0 text-sm">
                  {appt.appointmentCode && (
                    <span className="mb-1 inline-block rounded bg-secondary/10 px-1.5 py-0.5 text-[11px] font-bold text-secondary">
                      {appt.appointmentCode}
                    </span>
                  )}
                  <p className="truncate font-medium text-text-primary">{appt.suburb}</p>
                  {/* Agency per job — a group may be cross-agency, so label every row. */}
                  <p data-testid="offer-appointment-agency" className="truncate text-xs text-text-muted">
                    {appt.tenantName}
                  </p>
                  {appt.keyRequired && <p className="text-xs text-warning">Key required</p>}
                </div>
                {appt.payoutAmount != null && (
                  <span className="flex-shrink-0 text-sm font-semibold text-success">
                    {formatPayout(appt.payoutAmount)}
                  </span>
                )}
              </li>
            ))}
          </ul>
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
