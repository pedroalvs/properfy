import type { DashboardAnalyticsResponse } from '@properfy/shared';

interface AnalyticsKpiGridProps {
  kpis: DashboardAnalyticsResponse['kpis'];
  revenue: DashboardAnalyticsResponse['revenue'];
}

interface TileProps {
  label: string;
  value: string;
  hint?: string;
}

function Tile({ label, value, hint }: TileProps) {
  return (
    <div className="rounded bg-card-bg p-4 shadow-sm" data-testid="analytics-kpi">
      <div className="text-xs font-bold uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-text-primary">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-text-muted">{hint}</div>}
    </div>
  );
}

function formatMoney(amount: number, currency: string): string {
  return Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * The standing indicators beside the hero chart.
 *
 * Today / This week / This month are absolute calendar windows and deliberately
 * ignore the selected period — §4.1 asks for them as a constant read on the
 * operation. The period-dependent figures say so in their hint.
 *
 * Revenue is absent, not zeroed, when the actor may not read financials: a
 * `CL_USER` without `view_financials` receives `revenue: null` and the tile is
 * simply not rendered.
 */
export function AnalyticsKpiGrid({ kpis, revenue }: AnalyticsKpiGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Tile label="Today" value={String(kpis.today)} />
      <Tile label="This week" value={String(kpis.thisWeek)} />
      <Tile label="This month" value={String(kpis.thisMonth)} />
      {revenue ? (
        <Tile label="Revenue" value={formatMoney(revenue.amount, revenue.currency)} hint="Selected period" />
      ) : (
        <Tile label="In period" value={String(kpis.inPeriod)} hint="Selected period" />
      )}
      <Tile label="Cancelled" value={String(kpis.cancelledInPeriod)} hint="Selected period" />
      {revenue && <Tile label="In period" value={String(kpis.inPeriod)} hint="Selected period" />}
    </div>
  );
}
