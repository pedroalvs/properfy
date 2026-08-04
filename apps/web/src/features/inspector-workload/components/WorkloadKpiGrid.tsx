import type { InspectorWorkloadResponse } from '@properfy/shared';

interface WorkloadKpiGridProps {
  kpis: InspectorWorkloadResponse['kpis'];
  thresholds: InspectorWorkloadResponse['thresholds'];
}

interface TileProps {
  label: string;
  value: string;
  hint?: string;
  accentClass?: string;
}

function Tile({ label, value, hint, accentClass = 'border-l-primary' }: TileProps) {
  return (
    <div
      className={`rounded border-l-4 bg-card-bg p-4 shadow-sm ${accentClass}`}
      data-testid="workload-kpi"
    >
      <div className="text-xs font-bold uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-text-primary">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-text-muted">{hint}</div>}
    </div>
  );
}

/** "Alice, Bob and Carla" — reads better than a bare comma list in a hint. */
function nameList(inspectors: { inspectorName: string }[]): string {
  const names = inspectors.map((inspector) => inspector.inspectorName);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The four headline figures for the selected week.
 *
 * The average is deliberately taken over the whole active roster, so an idle
 * inspector pulls it down — that is the operationally honest reading, and the
 * denominator is printed alongside so it cannot be misread. An empty roster
 * shows an em dash rather than NaN.
 */
export function WorkloadKpiGrid({ kpis, thresholds }: WorkloadKpiGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="Inspections this week"
        value={String(kpis.totalInWeek)}
        hint="Scheduled or completed"
      />
      <Tile
        label="Avg. per inspector"
        value={kpis.avgPerInspector === null ? '—' : String(kpis.avgPerInspector)}
        hint={`Across ${kpis.activeInspectorCount} active inspector${kpis.activeInspectorCount === 1 ? '' : 's'}`}
        accentClass="border-l-accent"
      />
      <Tile
        label={`Near limit (${thresholds.weeklyBusy}+)`}
        value={String(kpis.nearLimit.count)}
        hint={nameList(kpis.nearLimit.inspectors) || 'Nobody approaching the limit'}
        accentClass="border-l-warning"
      />
      <Tile
        label={`Overloaded (${thresholds.weeklyOverloaded}+)`}
        value={String(kpis.overloaded.count)}
        hint={nameList(kpis.overloaded.inspectors) || 'Nobody over the limit'}
        accentClass="border-l-error"
      />
    </div>
  );
}
