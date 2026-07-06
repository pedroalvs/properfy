import { useEffect, useRef } from 'react';
import { formatCurrency } from '@/lib/format-currency';
import { formatDate } from '@/lib/format-date';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useMarketplaceOfferDetail } from '../hooks/useMarketplaceOfferDetail';

interface Props {
  groupId: string | null;
  onClose: () => void;
  onAccept?: () => void;
  accepting?: boolean;
}

export function GroupDetailBottomSheet({ groupId, onClose, onAccept, accepting }: Props) {
  const { data, isLoading, isError, refetch } = useMarketplaceOfferDetail(groupId);
  const isOnline = useIsOnline();
  const { showError } = useSnackbar();
  const isOpen = groupId !== null;
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAccept = () => {
    if (!isOnline) {
      showError('You need to be connected to accept offers');
      return;
    }
    onAccept?.();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50"
      data-testid="detail-backdrop"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl outline-none"
        data-testid="group-detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-black/10" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 id="group-detail-title" className="text-base font-bold text-secondary">Inspection details</h2>
          <button
            data-testid="detail-close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

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
                <span className="text-sm text-text-secondary">{data.timeWindow}</span>
                <span className="text-xs text-text-muted">{formatDate(data.scheduledDate)}</span>
              </div>

              <ul className="divide-y divide-gray-100">
                {data.appointments.map((appt) => (
                  <li key={appt.id} className="py-3">
                    <div className="flex items-start justify-between">
                      <div className="text-sm">
                        {appt.appointmentCode && (
                          <span className="mb-1 inline-block rounded bg-secondary/10 px-1.5 py-0.5 text-[11px] font-bold text-secondary">
                            {appt.appointmentCode}
                          </span>
                        )}
                        <p className="font-medium text-secondary">{appt.suburb}</p>
                        <p data-testid="appointment-time" className="text-xs font-semibold text-text-primary">
                          {appt.timeSlotStart}–{appt.timeSlotEnd}
                        </p>
                        {appt.tenantName && (
                          <p data-testid="appointment-agency" className="text-xs text-text-muted">{appt.tenantName}</p>
                        )}
                        {appt.keyRequired && (
                          <p className="text-xs text-warning">Key required</p>
                        )}
                        {appt.notes && (
                          <p className="text-xs text-text-secondary">{appt.notes}</p>
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

        {/* Accept CTA */}
        {onAccept && data && (
          <div className="border-t border-gray-100 px-5 pb-8 pt-4">
            <button
              data-testid="accept-group-btn"
              onClick={handleAccept}
              disabled={accepting}
              className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-white shadow-sm active:brightness-90 disabled:opacity-60"
            >
              {accepting ? 'Accepting…' : 'Accept group'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
