import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import { cn } from '@properfy/frontend-standards';
import { MAX_EXECUTION_DENSITY_CELLS, todayInTzDateString, PLATFORM_TIMEZONE } from '@properfy/shared';
import { DensityLayer, DENSITY_HEATMAP_RAMP } from '@/components/map/DensityLayer';
import { FilterSegmented } from '@/components/filters/FilterSegmented';
import { FilterDateRange } from '@/components/filters/FilterDateRange';
import { useExecutionDensity } from '../hooks/useExecutionDensity';
import {
  presetRange,
  validateCustomRange,
  type DensityPreset,
} from '../lib/execution-density-period';

export interface ExecutionDensityControlProps {
  map: mapboxgl.Map | null;
  /** AM/OP → Custom + agency/inspector filters; CL → presets only, no filters. */
  isGlobalRole: boolean;
  tenantId: string;
  inspectorId: string;
}

type Preset = DensityPreset | 'custom';

const GLOBAL_SUFFIX = 'Other map filters (status, branch, service, dates) don’t apply.';
const CL_SCOPE = 'Your agency’s inspections only. Other map filters don’t apply.';

const nf = new Intl.NumberFormat('en-AU');

/** Linear-gradient CSS from the heatmap ramp (number stops ∈ [0,1], string colours). */
function legendGradient(): string {
  const stops: string[] = [];
  for (let i = 0; i < DENSITY_HEATMAP_RAMP.length; i += 2) {
    const pos = DENSITY_HEATMAP_RAMP[i] as number;
    const color = DENSITY_HEATMAP_RAMP[i + 1] as string;
    stops.push(`${color} ${Math.round(pos * 100)}%`);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

function globalScopePrefix(tenantId: string, inspectorId: string): string {
  if (tenantId && inspectorId) return 'Filtered by agency and inspector';
  if (tenantId) return 'Filtered by agency';
  if (inspectorId) return 'Filtered by inspector';
  return 'All agencies';
}

export function ExecutionDensityControl({
  map,
  isGlobalRole,
  tenantId,
  inspectorId,
}: ExecutionDensityControlProps) {
  const [enabled, setEnabled] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>('30d');
  const [range, setRange] = useState(() => presetRange('30d'));
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const toggleRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const panelId = useId();

  // CL never sends agency/inspector filters (the backend rejects inspectorId for
  // agency accounts and ignores tenantId); the UI drops them defensively.
  const effectiveTenantId = isGlobalRole ? tenantId || undefined : undefined;
  const effectiveInspectorId = isGlobalRole ? inspectorId || undefined : undefined;

  const density = useExecutionDensity({
    enabled,
    fromDate: range.fromDate,
    toDate: range.toDate,
    tenantId: effectiveTenantId,
    inspectorId: effectiveInspectorId,
  });

  const cells = useMemo(() => density.cells, [density.cells]);
  const maxCount = useMemo(() => Math.max(1, ...cells.map((c) => c.count)), [cells]);

  // Re-anchor once when an agency account's stored period falls out of the
  // preset window after the Sydney day rolls over (L-F09-01). A second failure
  // leaves the error state in place (no retry loop).
  const retriedRef = useRef(false);
  useEffect(() => {
    if (!density.isError) retriedRef.current = false;
  }, [density.isError]);
  useEffect(() => {
    if (
      !isGlobalRole &&
      density.errorReason === 'PERIOD_NOT_A_PRESET' &&
      !retriedRef.current &&
      preset !== 'custom'
    ) {
      retriedRef.current = true;
      setRange(presetRange(preset));
    }
  }, [density.errorReason, isGlobalRole, preset]);

  const handleToggle = () => {
    if (!enabled) {
      setEnabled(true);
      setPanelOpen(true);
      setPreset('30d');
      setRange(presetRange('30d'));
      setCustomError(null);
    } else if (!panelOpen) {
      setPanelOpen(true);
    } else {
      setEnabled(false);
      setPanelOpen(false);
    }
  };

  const closePanel = (returnFocus: boolean) => {
    setPanelOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  };

  // Escape closes the panel (not the layer) and returns focus to the toggle.
  // A document listener matches the Dialog/DrawerPanel idiom (web CLAUDE.md §10)
  // and works wherever focus sits inside the panel, without a keyboard handler
  // on a non-interactive region element.
  useEffect(() => {
    if (!(enabled && panelOpen)) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setPanelOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, panelOpen]);

  const handlePeriodChange = (value: string) => {
    if (value === 'custom') {
      setPreset('custom');
      setCustomFrom(range.fromDate);
      setCustomTo(range.toDate);
      setCustomError(null);
      return;
    }
    const next = value as DensityPreset;
    setPreset(next);
    setRange(presetRange(next));
  };

  const applyCustom = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
    const error = validateCustomRange(from, to);
    setCustomError(error);
    if (!error) setRange({ fromDate: from, toDate: to });
  };

  const today = todayInTzDateString(PLATFORM_TIMEZONE);
  const periodOptions = [
    { label: 'Last 7 days', value: '7d' },
    { label: 'Last 30 days', value: '30d' },
    { label: 'Last 90 days', value: '90d' },
    ...(isGlobalRole ? [{ label: 'Custom', value: 'custom' }] : []),
  ];

  const scopeLine = isGlobalRole
    ? `${globalScopePrefix(tenantId, inspectorId)}. ${GLOBAL_SUFFIX}`
    : CL_SCOPE;

  const hasCells = cells.length > 0;
  const showLegend = enabled && !density.isError && !density.isLoading && hasCells;
  const showPrivacy = density.minCellCount > 1;

  return (
    <div className="relative">
      <button
        ref={toggleRef}
        type="button"
        onClick={handleToggle}
        aria-label="Activity density"
        aria-pressed={enabled}
        aria-controls={panelId}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-md transition-colors',
          enabled
            ? 'border-primary bg-primary text-white'
            : 'border-border-subtle bg-card-bg text-text-secondary hover:bg-gray-50',
        )}
      >
        <i className="mdi mdi-fire text-base" aria-hidden="true" />
        <span>Activity density</span>
      </button>

      {enabled && panelOpen && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={titleId}
          className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border-subtle bg-card-bg p-4 text-sm shadow-lg"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <h2 id={titleId} className="text-sm font-semibold text-text-primary">
                Activity density
              </h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                Inspector check-ins, grouped into ~100 m areas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => closePanel(false)}
              aria-label="Close activity density panel"
              className="rounded p-1 text-text-secondary hover:bg-gray-100"
            >
              <i className="mdi mdi-close text-base" aria-hidden="true" />
            </button>
          </div>

          <div className="mb-3">
            <FilterSegmented
              label="Period"
              value={preset}
              options={periodOptions}
              onChange={handlePeriodChange}
            />
          </div>

          {isGlobalRole && preset === 'custom' && (
            <div className="mb-3">
              <FilterDateRange
                label="Check-in dates"
                startDate={customFrom}
                endDate={customTo}
                onStartChange={(v) => applyCustom(v, customTo)}
                onEndChange={(v) => applyCustom(customFrom, v)}
                max={today}
              />
              {customError && (
                <p role="alert" className="mt-1 text-xs text-error">
                  {customError}
                </p>
              )}
            </div>
          )}

          <p className="mb-3 text-xs text-text-secondary">{scopeLine}</p>

          {showLegend && (
            <div data-testid="density-legend" className="mb-3">
              <div
                aria-hidden="true"
                className="h-2 w-full rounded"
                style={{ background: legendGradient() }}
              />
              <div className="mt-1 flex justify-between text-[11px] text-text-secondary">
                <span>1</span>
                {maxCount > 1 && <span>{nf.format(maxCount)}</span>}
              </div>
              <p className="mt-1 text-[11px] text-text-muted">
                Colour is relative to the busiest area in this view.
              </p>
            </div>
          )}

          <div aria-live="polite" className="space-y-0.5 text-xs text-text-secondary">
            {density.isError ? (
              <div className="space-y-2">
                <p>Couldn’t load activity density.</p>
                <button
                  type="button"
                  onClick={density.refetch}
                  className="rounded border border-border-subtle px-3 py-1 font-medium text-text-primary hover:bg-gray-50"
                >
                  Retry
                </button>
              </div>
            ) : density.isLoading ? (
              <p>Loading activity…</p>
            ) : hasCells ? (
              <>
                <p>
                  {nf.format(density.totalExecutions)} check-ins · {nf.format(density.cellCount)} areas
                </p>
                {density.excludedWithoutCoordinates > 0 && (
                  <p>{nf.format(density.excludedWithoutCoordinates)} check-ins without a location</p>
                )}
                {density.truncated && (
                  <p>Showing the {nf.format(MAX_EXECUTION_DENSITY_CELLS)} busiest areas.</p>
                )}
                {showPrivacy && (
                  <p>
                    Areas with fewer than {density.minCellCount} check-ins are hidden for privacy.
                  </p>
                )}
              </>
            ) : showPrivacy && density.totalExecutions > 0 ? (
              <p>
                No area has {density.minCellCount} or more check-ins in this period. Try a longer
                period.
              </p>
            ) : (
              <p>No check-ins in this period.</p>
            )}
          </div>
        </div>
      )}

      <DensityLayer map={map} cells={cells} visible={enabled} />
    </div>
  );
}
