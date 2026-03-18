import { memo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { formatDate, formatTime } from '@/lib/format-date';
import type { MarketplaceOffer, OfferAcceptState } from '../types';

interface OfferCardProps {
  offer: MarketplaceOffer;
  state: OfferAcceptState;
  onAccept: () => void;
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0]!;
  return dateStr === today;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `Posted ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Posted ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Posted ${days}d ago`;
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
            {formatDate(offer.scheduledDate)} | {formatTime(offer.timeWindowStart)} – {formatTime(offer.timeWindowEnd)}
          </p>
        </div>
        <span className="text-sm font-bold text-primary">
          {offer.appointmentCount} {offer.appointmentCount === 1 ? 'inspection' : 'inspections'}
        </span>
      </div>

      <p className="mt-2 text-sm text-text-primary">{offer.region}</p>
      <div className="flex items-center gap-2 text-xs text-text-muted">
        {offer.distance !== null && <span>~{Math.round(offer.distance)} km away</span>}
        <span data-testid="published-time">{formatTimeAgo(offer.publishedAt)}</span>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-text-secondary" data-testid="confirmation-chips">
        <span className="flex items-center gap-1">
          <i className="mdi mdi-check-circle text-success" aria-hidden="true" />
          {offer.confirmedCount} confirmed
        </span>
        <span className="flex items-center gap-1">
          <i className="mdi mdi-clock-outline text-warning" aria-hidden="true" />
          {offer.pendingCount} pending
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
          {offer.appointmentCount > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-xs font-bold uppercase text-text-secondary">Confirmation progress</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-border-subtle">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{
                    width: `${offer.appointmentCount > 0 ? Math.round((offer.confirmedCount / offer.appointmentCount) * 100) : 0}%`,
                  }}
                  data-testid="confirmation-progress-bar"
                />
              </div>
            </div>
          )}
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
