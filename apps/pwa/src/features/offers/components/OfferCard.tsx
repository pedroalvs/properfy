import { memo, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatDate, toLocalISODate } from '@/lib/format-date';
import { formatCurrency } from '@/lib/format-currency';
import type { MarketplaceOffer, OfferAcceptState } from '../types';

interface OfferCardProps {
  offer: MarketplaceOffer;
  state: OfferAcceptState;
  onAccept: () => void;
  onViewDetail?: () => void;
}

function isToday(dateStr: string): boolean {
  const today = toLocalISODate(new Date());
  return dateStr === today;
}

function isTomorrow(dateStr: string): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateStr === toLocalISODate(tomorrow);
}

function formatTimeWindow(timeWindow: string): string {
  return timeWindow.replace('-', ' – ');
}

function usePriorityCountdown(expiresAt: string | null): { label: string; isUrgent: boolean } | null {
  const [_tick, setTick] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { label: 'Priority expired', isUrgent: true };
  const totalMins = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const isUrgent = ms < 2 * 60 * 60 * 1000;
  const label = hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
  return { label, isUrgent };
}

const stateLabels: Partial<Record<OfferAcceptState, { label: string; className: string }>> = {
  ACCEPTED: { label: 'Accepted', className: 'bg-success/10 text-success' },
  CONFLICT: { label: 'Already taken', className: 'bg-warning/10 text-warning' },
  GONE: { label: 'No longer available', className: 'bg-text-muted/10 text-text-muted' },
  ERROR: { label: 'Try again', className: 'bg-error/10 text-error' },
};

export const OfferCard = memo(function OfferCard({ offer, state, onAccept, onViewDetail }: OfferCardProps) {
  const today = isToday(offer.scheduledDate);
  const tomorrow = isTomorrow(offer.scheduledDate);
  const resolved = stateLabels[state];
  const [faded, setFaded] = useState(false);
  const countdown = usePriorityCountdown(offer.priorityExpiresAt);

  useEffect(() => {
    if (state === 'ACCEPTED') {
      const timer = setTimeout(() => setFaded(true), 3000);
      return () => clearTimeout(timer);
    }
    setFaded(false);
  }, [state]);

  const dayLabel = today ? 'TODAY' : tomorrow ? 'TOMORROW' : null;

  return (
    <div
      className={`overflow-hidden rounded-[20px] border border-black/[0.06] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.07)] transition-opacity duration-500 ${faded ? 'opacity-40' : ''}`}
      data-testid={`offer-card-${offer.groupId}`}
    >
      {/* Header strip: date + time */}
      <div className="flex items-center gap-2 bg-gray-50 px-4 py-2.5 border-b border-black/[0.05]">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {dayLabel && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${today ? 'bg-warning' : 'bg-primary'}`}
              data-testid="day-badge"
            >
              {dayLabel}
            </span>
          )}
          <span className="text-xs font-semibold text-text-secondary truncate">
            {formatDate(offer.scheduledDate)}
          </span>
        </div>
        <span className="shrink-0 text-xs font-bold text-text-primary">
          {formatTimeWindow(offer.timeWindow)}
        </span>
      </div>

      <div className="px-4 pt-3 pb-4">
        {/* Service + payout */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-text-primary leading-tight">{offer.serviceTypeName}</p>
            <p className="mt-0.5 text-xs text-text-muted">{offer.tenantName}</p>
          </div>
          <div className="shrink-0 text-right">
            {offer.payoutEstimate != null ? (
              <>
                <p className="text-lg font-bold text-success leading-none" data-testid="payout-estimate">
                  {formatCurrency(offer.payoutEstimate)}
                </p>
                <p className="text-[10px] text-text-muted">est. payout</p>
              </>
            ) : (
              <span className="text-sm font-bold text-text-muted">—</span>
            )}
          </div>
        </div>

        {/* Inspection count */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            <i className="mdi mdi-home-outline text-[13px]" />
            {offer.appointmentCount} {offer.appointmentCount === 1 ? 'inspection' : 'inspections'}
          </span>
        </div>

        {/* Location summary */}
        {offer.suburbs.length > 0 && (
          <p className="mt-2.5 text-sm text-text-secondary">
            <i className="mdi mdi-map-marker-outline mr-1 text-text-muted" />
            {offer.suburbs.join(' · ')}
          </p>
        )}

        {/* Details drill-down */}
        {onViewDetail && (
          <button
            onClick={onViewDetail}
            className="mt-2 text-xs font-semibold text-primary underline-offset-2 hover:underline"
            data-testid="view-detail-button"
          >
            View inspections
          </button>
        )}

        {/* Priority countdown */}
        {countdown && (
          <div
            className={`mt-2 flex items-center gap-1 text-xs font-semibold ${countdown.isUrgent ? 'text-error' : 'text-warning'}`}
            data-testid="priority-countdown"
          >
            <i className={`mdi ${countdown.isUrgent ? 'mdi-clock-alert-outline' : 'mdi-clock-outline'}`} />
            Priority: {countdown.label}
          </div>
        )}

        {/* Action */}
        <div className="mt-4">
          {resolved ? (
            <div
              className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold ${resolved.className}`}
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
              className="!w-full !min-h-touch !rounded-xl !bg-success !text-base !font-bold"
              data-testid="accept-button"
            >
              Accept offer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
