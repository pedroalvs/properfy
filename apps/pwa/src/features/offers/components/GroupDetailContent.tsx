import { PROPERTY_TYPE_LABELS } from '@properfy/shared';
import { formatCurrency } from '@/lib/format-currency';
import { formatCivilDate, formatWallTimeRange, formatWallTimeWindow } from '@/lib/format-date';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useSnackbar } from '@/hooks/useSnackbar';
import { PROPERTY_TYPE_ICONS } from '../lib/property-type-icon';
import { useMarketplaceOfferDetail } from '../hooks/useMarketplaceOfferDetail';

interface Props {
  /** Group whose inspections to show; `null` renders nothing (sheet closed). */
  groupId: string | null;
  onAccept?: () => void;
  accepting?: boolean;
  className?: string;
}

/**
 * Shared body + footer for a group's inspections: the per-stop list, the group
 * Total, and the "Accept group" CTA. Reused by both presentations of the
 * marketplace detail — the phone bottom-sheet (GroupDetailBottomSheet) and the
 * tablet accordion (OfferAccordionList) — so the single source of truth for what
 * a group is worth and how it is accepted lives in one place.
 *
 * The per-stop `appointmentCode` ("INS-00xx") is intentionally not shown on this
 * screen: the inspector decides by address / time / payout, not by code.
 */
export function GroupDetailContent({ groupId, onAccept, accepting, className }: Props) {
  const { data, isLoading, isError, refetch } = useMarketplaceOfferDetail(groupId);
  const isOnline = useIsOnline();
  const { showError } = useSnackbar();

  if (groupId === null) return null;

  const handleAccept = () => {
    if (!isOnline) {
      showError('You need to be connected to accept offers');
      return;
    }
    onAccept?.();
  };

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className ?? ''}`}>
      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4" data-testid="detail-body">
        {isLoading && (
          <div data-testid="detail-loading" className="py-8 text-center text-sm text-text-secondary">
            Loading…
          </div>
        )}

        {isError && (
          <div data-testid="detail-error" className="py-8 text-center text-sm text-error">
            <p>Failed to load details. Please try again.</p>
            <button
              data-testid="detail-retry"
              onClick={() => refetch()}
              className="mt-3 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-secondary"
            >
              Retry
            </button>
          </div>
        )}

        {data && data.appointments.length === 0 && (
          <p data-testid="detail-empty" className="py-8 text-center text-sm text-text-secondary">
            No inspections in this group.
          </p>
        )}

        {data && data.appointments.length > 0 && (
          <>
            {/* Group-level info */}
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
              <span className="text-sm font-semibold text-text-primary">{data.serviceTypeName}</span>
              <span className="text-sm text-text-secondary">{formatWallTimeWindow(data.timeWindow)}</span>
              <span className="text-xs text-text-muted">{formatCivilDate(data.scheduledDate)}</span>
            </div>

            <ol className="divide-y divide-gray-100" data-testid="detail-stops">
              {data.appointments.map((appt, index) => (
                <li key={appt.id} className="flex items-start gap-3 py-3">
                  {/* 1-based stop number — mirrors the numbered pins on the map. */}
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-start gap-1 text-sm font-medium text-secondary" data-testid="appointment-address">
                      {appt.propertyType && (
                        <i
                          className={`mdi ${PROPERTY_TYPE_ICONS[appt.propertyType]} mt-0.5 shrink-0 text-text-muted`}
                          data-testid="appointment-property-type-icon"
                          role="img"
                          aria-label={PROPERTY_TYPE_LABELS[appt.propertyType]}
                        />
                      )}
                      {/* Full address (doc §7.2); street is blank for a
                          soft-deleted property, leaving the suburb alone. */}
                      <span>{[appt.street, appt.suburb].filter(Boolean).join(', ')}</span>
                    </p>
                    <p data-testid="appointment-time" className="text-xs font-semibold text-text-primary">
                      {formatWallTimeRange(appt.timeSlotStart, appt.timeSlotEnd)}
                    </p>
                    {appt.tenantName && (
                      <p data-testid="appointment-agency" className="text-xs text-text-muted">{appt.tenantName}</p>
                    )}
                    {appt.keyRequired && <p className="text-xs text-warning">Key required</p>}
                    {appt.notes && <p className="text-xs text-text-secondary">{appt.notes}</p>}
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
        Total + accept CTA. Pinned outside the scroll area so the group's value
        (doc §7.2) is on screen at the moment of the decision, however long the
        job list gets. The total does not depend on `onAccept` — a read-only
        view still has to show what the group is worth.
      */}
      {data && (
        <div className="border-t border-gray-100 px-5 pb-6 pt-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-text-secondary">Total</span>
            <span className="text-lg font-bold text-success" data-testid="group-total-payout">
              {data.payoutEstimate != null ? formatCurrency(data.payoutEstimate) : '—'}
            </span>
          </div>
          {onAccept && (
            <button
              data-testid="accept-group-btn"
              onClick={handleAccept}
              disabled={accepting}
              className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-white shadow-sm active:brightness-90 disabled:opacity-60"
            >
              {accepting ? 'Accepting…' : 'Accept group'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
