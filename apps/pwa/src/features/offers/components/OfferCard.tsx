import { memo, useEffect, useMemo, useState } from 'react';
import { Clock, ClockAlert, Home, MapPin } from 'lucide-react';
import { cn, TIMING } from '@properfy/frontend-standards';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import {
  PROPERTY_TYPE_LABELS,
  addCivilDays,
  todayInTzDateString,
} from '@properfy/shared';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { formatCivilDate, formatWallTimeWindow } from '@/lib/format-date';
import { formatCurrency } from '@/lib/format-currency';
import {
  PROPERTY_TYPE_ICONS,
  distinctPropertyTypes,
  pickOfferAddresses,
} from '../lib/property-type-icon';
import type { MarketplaceOffer, OfferAcceptState } from '../types';

interface OfferCardProps {
  offer: MarketplaceOffer;
  state: OfferAcceptState;
  onAccept: () => void;
  onViewDetail?: () => void;
}

/**
 * Which of TODAY / TOMORROW (if either) an offer's date falls on.
 *
 * Both answers come from ONE reading of the effective-timezone day. Reading it
 * twice lets midnight roll over between the two calls, which drops the badge a
 * render early — the date is no longer today, and is no longer the new anchor
 * plus one either.
 *
 * `addCivilDays` keeps the arithmetic device-independent: it anchors on the
 * timezone's own calendar day and advances in UTC, which has no DST.
 */
function relativeDayLabel(dateStr: string, timeZone: string): 'TODAY' | 'TOMORROW' | null {
  const day = dateStr.slice(0, 10);
  const today = todayInTzDateString(timeZone);
  if (day === today) return 'TODAY';
  return day === addCivilDays(today, 1) ? 'TOMORROW' : null;
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

const stateLabels: Partial<Record<OfferAcceptState, { label: string; tone: BadgeProps['tone'] }>> = {
  ACCEPTED: { label: 'Accepted', tone: 'green' },
  CONFLICT: { label: 'Already taken', tone: 'amber' },
  GONE: { label: 'No longer available', tone: 'gray' },
};

export const OfferCard = memo(function OfferCard({ offer, state, onAccept, onViewDetail }: OfferCardProps) {
  const timeZone = useEffectiveTimezone();
  const dayLabel = relativeDayLabel(offer.scheduledDate, timeZone);
  const resolved = stateLabels[state];
  const [faded, setFaded] = useState(false);
  // `priorityExpiresAt` is optional: the backend does not send it today, so an
  // absent field and an explicit null both mean "no countdown".
  const countdown = usePriorityCountdown(offer.priorityExpiresAt ?? null);

  useEffect(() => {
    if (state === 'ACCEPTED') {
      const timer = setTimeout(() => setFaded(true), TIMING.toastDismiss);
      return () => clearTimeout(timer);
    }
    setFaded(false);
  }, [state]);

  // Derived arrays must be memoized on the raw payload — see apps/pwa/CLAUDE.md
  // rule 11 (the PR #961 render-loop lesson).
  const propertyTypes = useMemo(
    () => distinctPropertyTypes(offer.properties ?? []),
    [offer.properties],
  );
  const address = useMemo(
    () => pickOfferAddresses(offer.properties ?? [], offer.suburbs),
    [offer.properties, offer.suburbs],
  );

  return (
    <Card
      className={cn(
        'overflow-hidden p-0 transition-opacity duration-500',
        faded && 'opacity-40',
      )}
      data-testid={`offer-card-${offer.groupId}`}
    >
      {/* Header strip: date + time */}
      <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2.5">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {dayLabel && (
            <Badge
              tone={dayLabel === 'TODAY' ? 'amber' : 'blue'}
              className="shrink-0 h-auto px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
              data-testid="day-badge"
            >
              {dayLabel}
            </Badge>
          )}
          <span className="text-xs font-semibold text-muted-foreground truncate">
            {formatCivilDate(offer.scheduledDate)}
          </span>
        </div>
        <span className="shrink-0 text-xs font-bold text-foreground">
          {formatWallTimeWindow(offer.timeWindow)}
        </span>
      </div>

      <div className="px-4 pt-3 pb-4">
        {/* Service + payout */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-foreground leading-tight">
              {offer.serviceTypeName}
              {offer.code ? <span className="ml-2 font-mono text-xs font-semibold text-muted-foreground">#{offer.code}</span> : null}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{offer.tenantName}</p>
          </div>
          <div className="shrink-0 text-right">
            {offer.payoutEstimate != null ? (
              <>
                <p className="text-lg font-bold text-success leading-none" data-testid="payout-estimate">
                  {formatCurrency(offer.payoutEstimate)}
                </p>
                <p className="text-[10px] text-muted-foreground">est. payout</p>
              </>
            ) : (
              <span className="text-sm font-bold text-muted-foreground">—</span>
            )}
          </div>
        </div>

        {/* Inspection count, prefixed by one icon per distinct property type */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {propertyTypes.length > 0 ? (
              propertyTypes.map((type) => {
                const Icon = PROPERTY_TYPE_ICONS[type];
                return (
                  <Icon
                    key={type}
                    size={13}
                    data-testid="property-type-icon"
                    role="img"
                    aria-label={PROPERTY_TYPE_LABELS[type]}
                  />
                );
              })
            ) : (
              <Home size={13} data-testid="property-type-icon-fallback" aria-hidden="true" />
            )}
            {offer.appointmentCount} {offer.appointmentCount === 1 ? 'inspection' : 'inspections'}
          </span>
        </div>

        {/* Location: one full street address, plus how many more the group holds */}
        {address.primary && (
          <div className="mt-2.5 text-sm text-muted-foreground">
            <p data-testid="offer-address">
              <MapPin size={14} className="mr-1 inline text-muted-foreground" aria-hidden="true" />
              {address.primary}
            </p>
            {address.remaining > 0 && (
              <p className="mt-0.5 pl-5 text-xs text-muted-foreground" data-testid="offer-address-more">
                +{address.remaining} more {address.remaining === 1 ? 'address' : 'addresses'}
              </p>
            )}
          </div>
        )}

        {/* Details drill-down */}
        {onViewDetail && (
          <button
            onClick={onViewDetail}
            className="mt-1 inline-flex min-h-[44px] items-center py-2 pr-2 text-xs font-semibold text-primary underline-offset-2 hover:underline"
            data-testid="view-detail-button"
          >
            View inspections
          </button>
        )}

        {/* Priority countdown */}
        {countdown && (
          <div
            className={cn(
              'mt-2 flex items-center gap-1 text-xs font-semibold',
              countdown.isUrgent ? 'text-destructive' : 'text-warning',
            )}
            data-testid="priority-countdown"
          >
            {countdown.isUrgent ? (
              <ClockAlert size={12} aria-hidden="true" />
            ) : (
              <Clock size={12} aria-hidden="true" />
            )}
            Priority: {countdown.label}
          </div>
        )}

        {/* Action */}
        <div className="mt-4">
          {resolved ? (
            <Badge
              tone={resolved.tone}
              className="h-auto w-full justify-center py-2.5 text-sm"
              data-testid="offer-state-label"
              role="alert"
            >
              {resolved.label}
            </Badge>
          ) : (
            <Button
              variant="primary"
              block
              onClick={onAccept}
              loading={state === 'ACCEPTING'}
              disabled={state === 'ACCEPTING' || state === 'CONFIRMING'}
              className="text-base"
              data-testid="accept-button"
            >
              Accept offer
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
});
