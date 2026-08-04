import type { InspectorWorkloadResponse, WeekFunnel } from '@properfy/shared';
import { ChartCard } from '@/features/analytics/components/charts/ChartCard';
import { SEQUENTIAL_HUE } from '@/features/analytics/components/charts/theme';
import { formatWeekRange, percentOf, withAlpha } from './workload-visuals';

interface WeeklyComparisonPanelsProps {
  funnel: InspectorWorkloadResponse['funnel'];
}

interface PanelRow {
  panel: string;
  funnel: WeekFunnel;
}

/** Three opacities of the one sequential hue — stages of one measure, not three
 *  separate series, so a categorical palette would imply the wrong thing. */
const STAGE_ALPHA = { done: 0.35, scheduled: 0.6, confirmed: 0.9 } as const;

interface StageBarProps {
  name: string;
  value: number;
  /** Share of the week's scheduled work, or `null` for the reference stage. */
  share: number | null;
  alpha: number;
  scaleMax: number;
}

function StageBar({ name, value, share, alpha, scaleMax }: StageBarProps) {
  const width = scaleMax > 0 ? (value / scaleMax) * 100 : 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-semibold text-text-secondary">{name}</span>
        <span className="tabular-nums">
          <b className="text-sm text-text-primary">{value}</b>
          {share !== null && <span className="ml-1 text-text-muted">{share}%</span>}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-black/5">
        <div
          className="h-full rounded-full"
          style={{ width: `${width}%`, backgroundColor: withAlpha(SEQUENTIAL_HUE, alpha) }}
        />
      </div>
    </div>
  );
}

function Panel({ label, funnel, scaleMax }: { label: string; funnel: WeekFunnel; scaleMax: number }) {
  return (
    <div className="rounded border border-black/10 p-4">
      <div className="mb-3">
        <div className="text-sm font-bold text-text-primary">{label}</div>
        <div className="text-xs text-text-muted">
          {formatWeekRange(funnel.weekStart, funnel.weekEnd)}
        </div>
      </div>
      <StageBar
        name="Done"
        value={funnel.done}
        share={percentOf(funnel.done, funnel.scheduled)}
        alpha={STAGE_ALPHA.done}
        scaleMax={scaleMax}
      />
      <StageBar
        name="Scheduled"
        value={funnel.scheduled}
        share={null}
        alpha={STAGE_ALPHA.scheduled}
        scaleMax={scaleMax}
      />
      <StageBar
        name="Confirmed"
        value={funnel.confirmed}
        share={percentOf(funnel.confirmed, funnel.scheduled)}
        alpha={STAGE_ALPHA.confirmed}
        scaleMax={scaleMax}
      />
    </div>
  );
}

/**
 * The selected week against the weeks either side of it.
 *
 * All three panels share one scale — the largest `scheduled` across them — so
 * the bars are comparable between panels rather than only within one. Scaling
 * each panel to its own maximum would make a quiet week look identical to a busy
 * one, which is the whole question this strip answers.
 *
 * `Scheduled` is the reference stage and carries no percentage: it *is* the
 * denominator. Confirmation naturally trails further out, so next week's share
 * being low is expected rather than a problem.
 */
export function WeeklyComparisonPanels({ funnel }: WeeklyComparisonPanelsProps) {
  const rows: PanelRow[] = [
    { panel: 'Previous week', funnel: funnel.previous },
    { panel: 'Selected week', funnel: funnel.selected },
    { panel: 'Next week', funnel: funnel.next },
  ];

  const scaleMax = Math.max(...rows.map((row) => row.funnel.scheduled), 1);

  return (
    <ChartCard<PanelRow>
      title="Week on week"
      caption="Committed work and how much of it is confirmed and completed. All three panels share one scale."
      tableRows={rows}
      tableColumns={[
        { header: 'Week', cell: (row) => row.panel },
        { header: 'Dates', cell: (row) => formatWeekRange(row.funnel.weekStart, row.funnel.weekEnd) },
        { header: 'Scheduled', cell: (row) => row.funnel.scheduled, numeric: true },
        { header: 'Done', cell: (row) => row.funnel.done, numeric: true },
        {
          header: 'Done %',
          cell: (row) => shareLabel(percentOf(row.funnel.done, row.funnel.scheduled)),
          numeric: true,
        },
        { header: 'Confirmed', cell: (row) => row.funnel.confirmed, numeric: true },
        {
          header: 'Confirmed %',
          cell: (row) => shareLabel(percentOf(row.funnel.confirmed, row.funnel.scheduled)),
          numeric: true,
        },
      ]}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {rows.map((row) => (
          <Panel key={row.panel} label={row.panel} funnel={row.funnel} scaleMax={scaleMax} />
        ))}
      </div>
    </ChartCard>
  );
}

/** An em dash, never `0%` or `NaN`, when there is nothing to divide by. */
function shareLabel(share: number | null): string {
  return share === null ? '—' : `${share}%`;
}
