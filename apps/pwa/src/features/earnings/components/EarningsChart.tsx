import { BarChart3 } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { Card } from '@/components/ui/Card';

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
      <Card className="p-6 text-center" data-testid="earnings-chart-empty">
        <BarChart3 size={40} className="text-muted-foreground" aria-hidden="true" />
        <p className="mt-2 text-xs text-muted-foreground">No earnings to chart for this period.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4" data-testid="earnings-chart">
      <div className="flex h-40 items-end justify-between gap-2 md:h-56">
        {bars.map((bar, i) => {
          const heightPct = Math.round((bar.value / max) * 100);
          return (
            <div key={`${bar.label}-${i}`} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-32 w-full items-end md:h-48">
                <div
                  className={cn('w-full rounded-t-md bg-gradient-to-t from-success/70 to-success')}
                  style={{ height: `${Math.max(heightPct, bar.value > 0 ? 6 : 0)}%` }}
                  role="img"
                  aria-label={`${bar.label}: ${bar.value}`}
                />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">{bar.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
