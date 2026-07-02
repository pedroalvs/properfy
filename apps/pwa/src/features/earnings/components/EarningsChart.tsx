export interface ChartBar {
  label: string;
  value: number;
}

interface EarningsChartProps {
  bars: ChartBar[];
  currency?: string;
}

/**
 * 031 — lightweight inline-SVG bar chart of monthly approved earnings.
 * No chart dependency (keeps the PWA bundle small).
 */
export function EarningsChart({ bars }: EarningsChartProps) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const hasData = bars.some((b) => b.value > 0);

  if (!hasData) {
    return (
      <div className="rounded-[20px] bg-white p-6 text-center shadow-sm" data-testid="earnings-chart-empty">
        <i className="mdi mdi-chart-bar text-[40px] text-text-muted" aria-hidden="true" />
        <p className="mt-2 text-xs text-text-secondary">No earnings to chart for this period.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] bg-white p-4 shadow-sm" data-testid="earnings-chart">
      <div className="flex h-40 items-end justify-between gap-2">
        {bars.map((bar, i) => {
          const heightPct = Math.round((bar.value / max) * 100);
          return (
            <div key={`${bar.label}-${i}`} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-32 w-full items-end">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-success/70 to-success"
                  style={{ height: `${Math.max(heightPct, bar.value > 0 ? 6 : 0)}%` }}
                  role="img"
                  aria-label={`${bar.label}: ${bar.value}`}
                />
              </div>
              <span className="text-[10px] font-medium text-text-muted">{bar.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
