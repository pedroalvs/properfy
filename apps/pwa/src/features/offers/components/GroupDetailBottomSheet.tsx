import { formatCurrency } from '@/lib/format-currency';
import { formatDate } from '@/lib/format-date';
import { useMarketplaceOfferDetail } from '../hooks/useMarketplaceOfferDetail';

interface Props {
  groupId: string | null;
  onClose: () => void;
  onAccept?: () => void;
}

export function GroupDetailBottomSheet({ groupId, onClose, onAccept }: Props) {
  const { data, isLoading, isError } = useMarketplaceOfferDetail(groupId);

  if (groupId === null) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[200] flex flex-col rounded-t-3xl bg-white shadow-2xl"
      data-testid="group-detail-sheet"
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-2">
        <div className="h-1 w-10 rounded-full bg-black/10" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-3">
        <h2 className="text-base font-bold text-secondary">Inspection details</h2>
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
      <div className="overflow-y-auto px-5 pb-4">
        {isLoading && (
          <div data-testid="detail-loading" className="py-8 text-center text-sm text-text-secondary">
            Loading…
          </div>
        )}

        {isError && (
          <div data-testid="detail-error" className="py-8 text-center text-sm text-error">
            Failed to load details. Please try again.
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
              {data.code && (
                <span className="rounded bg-secondary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-secondary">
                  Group #{data.code}
                </span>
              )}
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
            onClick={onAccept}
            className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-white shadow-sm active:brightness-90"
          >
            Accept group
          </button>
        </div>
      )}
    </div>
  );
}
