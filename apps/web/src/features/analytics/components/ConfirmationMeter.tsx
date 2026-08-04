import type { DashboardAnalyticsResponse } from '@properfy/shared';
import { SEQUENTIAL_HUE } from './charts/theme';

interface ConfirmationMeterProps {
  confirmationRate: DashboardAnalyticsResponse['confirmationRate'];
}

/**
 * A meter, not a donut.
 *
 * This is one ratio against a limit, and a two-slice pie is the wrong form for
 * it: the reader has to compare arc lengths to recover a number the meter simply
 * states. The track is the same hue as the fill at low opacity, so the encoding
 * is one hue plus length — no second colour to interpret.
 *
 * Only appointments whose service type asks the rental tenant enter the
 * denominator, so a period of Ingoing/Outgoing work alone shows "—" rather than
 * a misleading 0%.
 */
export function ConfirmationMeter({ confirmationRate }: ConfirmationMeterProps) {
  const { confirmed, eligible } = confirmationRate;
  const hasData = eligible > 0;
  const percent = hasData ? Math.round((confirmed / eligible) * 100) : 0;

  return (
    // Flex column so the figure sits centred in whatever height the row's
    // tallest card imposes, rather than stranding it at the top.
    <div className="flex flex-col rounded bg-card-bg p-4 shadow-sm" data-testid="confirmation-meter">
      <h2 className="text-base font-bold text-secondary">Tenant confirmation</h2>
      <p className="mt-0.5 text-xs text-text-muted">Share of services the tenant confirmed</p>

      {hasData ? (
        <div className="flex flex-1 flex-col justify-center py-6">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold tabular-nums text-text-primary">{percent}%</span>
          </div>
          <div
            className="mt-3 h-3 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: `${SEQUENTIAL_HUE}1F` }}
            role="meter"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Tenant confirmation rate: ${confirmed} of ${eligible} services confirmed`}
          >
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${percent}%`, backgroundColor: SEQUENTIAL_HUE }}
            />
          </div>
          <p className="mt-2 text-sm text-text-secondary tabular-nums">
            {confirmed} of {eligible} services
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center py-6">
          <div className="text-5xl font-bold text-text-muted" aria-hidden="true">
            —
          </div>
          <p className="mt-3 text-sm text-text-secondary">
            No service in this period required tenant confirmation.
          </p>
        </div>
      )}
    </div>
  );
}
