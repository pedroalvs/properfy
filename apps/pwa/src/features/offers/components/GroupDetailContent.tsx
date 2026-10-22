import { PROPERTY_TYPE_LABELS } from '@properfy/shared';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/format-currency';
import { formatCivilDate, formatWallTimeRange, formatWallTimeWindow } from '@/lib/format-date';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useSnackbar } from '@/hooks/useSnackbar';
import { PROPERTY_TYPE_ICONS } from '../lib/property-type-icon';
import { useMarketplaceOfferDetail } from '../hooks/useMarketplaceOfferDetail';

interface Props {
  groupId: string | null;
  onAccept?: () => void;
  accepting?: boolean;
}

/**
 * The scrollable body + pinned total/accept footer of the marketplace group detail. Rendered
 * both inside the phone bottom-sheet (`GroupDetailBottomSheet`) and the tablet right-pane
 * (`GroupDetailPane`), so the two presentations share one source of truth. Returns a fragment so
 * the host's flex column can make the body (`flex-1`) fill and keep the footer pinned.
 */
export function GroupDetailContent({ groupId, onAccept, accepting }: Props) {
  const { data, isLoading, isError, refetch } = useMarketplaceOfferDetail(groupId);
  const isOnline = useIsOnline();
  const { showError } = useSnackbar();

  const handleAccept = () => {
    if (!isOnline) {
      showError('You need to be connected to accept offers');
      return;
    }
    onAccept?.();
  };

  return (
    <>
      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4" data-testid="detail-body">
        {isLoading && (
          <div data-testid="detail-loading" className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {isError && (
          <div data-testid="detail-error" className="py-8 text-center text-sm text-destructive">
            <p>Failed to load details. Please try again.</p>
            <Button
              variant="outlined"
              data-testid="detail-retry"
              onClick={() => refetch()}
              className="mt-3"
            >
              Retry
            </Button>
          </div>
        )}

        {data && data.appointments.length === 0 && (
          <p data-testid="detail-empty" className="py-8 text-center text-sm text-muted-foreground">
            No inspections in this group.
          </p>
        )}

        {data && data.appointments.length > 0 && (
          <>
            {/* Group-level info */}
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-3">
              <span className="text-sm font-semibold text-foreground">{data.serviceTypeName}</span>
              <span className="text-sm text-muted-foreground">{formatWallTimeWindow(data.timeWindow)}</span>
              <span className="text-xs text-muted-foreground">{formatCivilDate(data.scheduledDate)}</span>
            </div>

            {/* Stops numbered 1..N to mirror the numbered pins on the map. The
                per-stop appointment code is intentionally not shown on this
                screen — the inspector decides by address / time / payout. */}
            <ol className="divide-y divide-border" data-testid="detail-stops">
              {data.appointments.map((appt, index) => (
                <li key={appt.id} className="flex items-start gap-3 py-3">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex items-start gap-1 font-medium text-foreground" data-testid="appointment-address">
                      {appt.propertyType && (() => {
                        const Icon = PROPERTY_TYPE_ICONS[appt.propertyType!];
                        return (
                          <Icon
                            className="mt-0.5 shrink-0 text-muted-foreground"
                            size={14}
                            data-testid="appointment-property-type-icon"
                            role="img"
                            aria-label={PROPERTY_TYPE_LABELS[appt.propertyType!]}
                          />
                        );
                      })()}
                      {/* Full address (doc §7.2); street is blank for a
                          soft-deleted property, leaving the suburb alone. */}
                      <span>{[appt.street, appt.suburb].filter(Boolean).join(', ')}</span>
                    </p>
                    <p data-testid="appointment-time" className="text-xs font-semibold text-foreground">
                      {formatWallTimeRange(appt.timeSlotStart, appt.timeSlotEnd)}
                    </p>
                    {appt.tenantName && (
                      <p data-testid="appointment-agency" className="text-xs text-muted-foreground">{appt.tenantName}</p>
                    )}
                    {appt.keyRequired && (
                      <p className="text-xs text-warning">Key required</p>
                    )}
                    {appt.notes && (
                      <p className="text-xs text-muted-foreground">{appt.notes}</p>
                    )}
                  </div>
                  {appt.payoutAmount != null && (
                    <span
                      data-testid="appointment-payout"
                      className="shrink-0 text-sm font-semibold text-success"
                    >
                      {formatCurrency(appt.payoutAmount)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      {/*
        Total + accept CTA. Pinned outside the scroll area so the group's
        value (doc §7.2) is on screen at the moment of the decision, however
        long the job list gets. The total does not depend on `onAccept` — a
        read-only sheet still has to show what the group is worth.
      */}
      {data && (
        <div className="border-t border-border px-5 pb-8 pt-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-muted-foreground">Total</span>
            <span
              className="text-lg font-bold text-success"
              data-testid="group-total-payout"
            >
              {data.payoutEstimate != null ? formatCurrency(data.payoutEstimate) : '—'}
            </span>
          </div>
          {onAccept && (
            <Button
              variant="primary"
              block
              data-testid="accept-group-btn"
              onClick={handleAccept}
              disabled={accepting}
              className="font-bold"
            >
              {accepting ? 'Accepting…' : 'Accept group'}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
