import { formatCurrency, type ProgramPeriodSummaryResponse } from '@properfy/shared';

type Totals = ProgramPeriodSummaryResponse['totals'];

const PROMISED_HELP = 'The most you could pay if every eligible inspector reached every goal.';

function Tile({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="flex min-w-[140px] flex-1 flex-col gap-1 rounded bg-card-bg p-4 shadow-sm">
      <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        <span>{label}</span>
        {help && (
          <i
            className="mdi mdi-information-outline text-sm text-text-muted"
            title={help}
            aria-label={help}
            role="img"
          />
        )}
      </div>
      <span className="text-xl font-bold tabular-nums text-text-primary">{value}</span>
    </div>
  );
}

/** Promised / Achieved / Approved / Paid tiles (AUD). "Paid" stays $0.00 until TASK-F08-6. */
export function ProgramTotals({ totals }: { totals: Totals }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Tile label="Promised" value={formatCurrency(totals.promised)} help={PROMISED_HELP} />
      <Tile label="Achieved" value={formatCurrency(totals.achieved)} />
      <Tile label="Approved" value={formatCurrency(totals.approved)} />
      <Tile label="Paid" value={formatCurrency(totals.paid)} />
    </div>
  );
}
