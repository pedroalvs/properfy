import { formatCurrency } from '@/lib/format-currency';
import { useMarketplaceOfferDetail } from '../hooks/useMarketplaceOfferDetail';

interface Props {
  groupId: string | null;
  onClose: () => void;
}

export function GroupDetailBottomSheet({ groupId, onClose }: Props) {
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
      <div className="overflow-y-auto px-5 pb-8">
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
          <ul className="divide-y divide-gray-100">
            {data.appointments.map((appt) => (
              <li key={appt.id} className="flex items-center justify-between py-3">
                <div className="text-sm">
                  <p className="font-medium text-secondary">{appt.suburb}</p>
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
              </li>
            ))}
          </ul>
        )}

      </div>
    </div>
  );
}
