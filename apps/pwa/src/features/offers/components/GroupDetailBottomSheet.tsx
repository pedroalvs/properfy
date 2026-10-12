import { useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Z_INDEX } from '@properfy/frontend-standards';
import { PROPERTY_TYPE_LABELS } from '@properfy/shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Sheet, SheetOverlay, SheetPortal, SheetTitle } from '@/components/ui/Sheet';
import { formatCurrency } from '@/lib/format-currency';
import { formatCivilDate, formatWallTimeRange, formatWallTimeWindow } from '@/lib/format-date';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useSnackbar } from '@/hooks/useSnackbar';
import { PROPERTY_TYPE_ICONS } from '../lib/property-type-icon';
import { useMarketplaceOfferDetail } from '../hooks/useMarketplaceOfferDetail';

interface Props {
  groupId: string | null;
  onClose: () => void;
  onAccept?: () => void;
  accepting?: boolean;
}

/**
 * Marketplace group detail as a Radix bottom-sheet. The shared `Sheet` primitive
 * supplies the focus trap, Escape handling, scroll lock, portal and focus restore. The
 * overlay is rendered explicitly (rather than via `SheetContent`) so the `detail-backdrop`
 * test id stays queryable on the scrim. While `accepting`, dismissal (backdrop, Escape,
 * close button) is inert so an in-flight acceptance cannot be abandoned mid-request.
 */
export function GroupDetailBottomSheet({ groupId, onClose, onAccept, accepting }: Props) {
  const { data, isLoading, isError, refetch } = useMarketplaceOfferDetail(groupId);
  const isOnline = useIsOnline();
  const { showError } = useSnackbar();
  const isOpen = groupId !== null;
  const contentRef = useRef<HTMLDivElement>(null);

  const handleAccept = () => {
    if (!isOnline) {
      showError('You need to be connected to accept offers');
      return;
    }
    onAccept?.();
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && !accepting) onClose();
      }}
    >
      <SheetPortal>
        <SheetOverlay data-testid="detail-backdrop" style={{ zIndex: Z_INDEX.overlay }} />
        <DialogPrimitive.Content
          ref={contentRef}
          tabIndex={-1}
          data-testid="group-detail-sheet"
          aria-describedby={undefined}
          style={{ zIndex: Z_INDEX.overlay }}
          className="fixed inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-card border-t border-border bg-card pb-safe-b shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
          onOpenAutoFocus={(event) => {
            // Match the previous behaviour: focus the sheet container itself, not the
            // first focusable control.
            event.preventDefault();
            contentRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (accepting) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (accepting) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (accepting) event.preventDefault();
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="h-1 w-10 rounded-full bg-border" aria-hidden="true" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-3">
            <SheetTitle className="text-base">Inspection details</SheetTitle>
            <button
              data-testid="detail-close"
              onClick={() => {
                if (!accepting) onClose();
              }}
              disabled={accepting}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

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

                <ul className="divide-y divide-border">
                  {data.appointments.map((appt) => (
                    <li key={appt.id} className="py-3">
                      <div className="flex items-start justify-between">
                        <div className="text-sm">
                          {appt.appointmentCode && (
                            <Badge tone="gray" className="mb-1 h-auto px-1.5 py-0.5 text-[11px]">
                              {appt.appointmentCode}
                            </Badge>
                          )}
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
                            className="text-sm font-semibold text-success"
                          >
                            {formatCurrency(appt.payoutAmount)}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
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
        </DialogPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}
