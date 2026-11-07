import { useEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '@properfy/frontend-standards';
import {
  type LiveDayInspector,
  type LiveDayResponse,
  PLATFORM_TIMEZONE,
  addCivilDays,
  formatInstantTime,
  formatShortDayLabel,
} from '@properfy/shared';
import { DateInput } from '@/components/forms/DateInput';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { EmptyState } from '@/components/feedback/EmptyState';
import type { UseEtaAccuracyReturn } from '../hooks/useEtaAccuracy';
import { LiveDayInspectorRow } from './LiveDayInspectorRow';
import { LiveDayInspectorDetail } from './LiveDayInspectorDetail';
import { RouteEtaAccuracyFooter } from './RouteEtaAccuracyFooter';

const HELP_TEXT =
  "Positions come from each inspector's last check-in or check-out. Properfy doesn't track inspectors between stops, so 'In transit' is an estimate.";
const SHOW_ALL_DISABLED_TOOLTIP = 'Narrow the list (Needs attention) to show all routes — up to 40 at once';

interface LiveDayPanelProps {
  data: LiveDayResponse;
  visibleInspectors: LiveDayInspector[];
  selectedInspector: LiveDayInspector | null;
  needsAttention: boolean;
  showAll: boolean;
  canShowAll: boolean;
  isLive: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  pollError: boolean;
  redirectNotice: string | null;
  eta: UseEtaAccuracyReturn;
  detailHeadingRef: RefObject<HTMLHeadingElement>;
  onDateChange: (date: string) => void;
  onToday: () => void;
  onToggleAttention: () => void;
  onToggleShowAll: () => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onRetry: () => void;
  onShowEveryone: () => void;
  onInteractingChange: (interacting: boolean) => void;
}

/** "Updated just now / N s ago / N min ago" from the last fetch; re-ticks every 15s, no aria-live. */
function UpdatedLabel({ dataUpdatedAt, isLive, isFetching }: { dataUpdatedAt: number; isLive: boolean; isFetching: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((now - dataUpdatedAt) / 1000));
  const text = secs < 10 ? 'Updated just now' : secs < 60 ? `Updated ${secs} s ago` : `Updated ${Math.floor(secs / 60)} min ago`;
  return (
    <span className="flex items-center gap-1 text-xs text-text-muted">
      {isFetching && isLive && <i className="mdi mdi-refresh mdi-spin text-sm leading-none" aria-hidden="true" />}
      {text}
    </span>
  );
}

function civilShortLabel(date: string): string {
  // Noon UTC falls on the same civil day for every AU timezone, so the label never shifts.
  return formatShortDayLabel(`${date}T12:00:00Z`, PLATFORM_TIMEZONE);
}

function SummaryCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col rounded bg-app-bg px-2 py-1 text-center">
      <span className="text-base font-bold text-text-primary">{value}</span>
      <span className="text-[11px] leading-tight text-text-secondary">{label}</span>
    </div>
  );
}

/**
 * The Live Day side panel: header + help, date selector, summary counters,
 * filters, the inspector list (or the selected inspector's detail), and the
 * ETA-accuracy footer. Purely presentational — the page owns data, URL and the map.
 */
export function LiveDayPanel({
  data,
  visibleInspectors,
  selectedInspector,
  needsAttention,
  showAll,
  canShowAll,
  isLive,
  isFetching,
  dataUpdatedAt,
  pollError,
  redirectNotice,
  eta,
  detailHeadingRef,
  onDateChange,
  onToday,
  onToggleAttention,
  onToggleShowAll,
  onSelect,
  onBack,
  onRetry,
  onShowEveryone,
  onInteractingChange,
}: LiveDayPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const isPastDay = data.date < data.today;
  const isFutureDay = data.date > data.today;
  const dayLabel = civilShortLabel(data.date);

  const emptyForAttention = needsAttention && visibleInspectors.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border-subtle p-3">
        <div className="flex items-start justify-between gap-2">
          <h1 className="flex items-center gap-1 text-xl font-bold text-secondary">
            Live Day
            <Tooltip label={HELP_TEXT}>
              <i className="mdi mdi-help-circle-outline text-base text-text-muted" aria-hidden="true" />
            </Tooltip>
          </h1>
          <UpdatedLabel dataUpdatedAt={dataUpdatedAt} isLive={isLive} isFetching={isFetching} />
        </div>
        <p className="text-sm text-text-secondary">
          {isLive ? 'Last known location · updates every 30 s' : 'Last known location'}
        </p>
        <div className="mt-2 flex items-end gap-2">
          <div className="flex flex-col text-xs font-semibold text-text-secondary">
            <label htmlFor="live-day-date">Day</label>
            <DateInput
              id="live-day-date"
              value={data.date}
              onChange={onDateChange}
              max={addCivilDays(data.today, 1)}
              aria-label="Day"
            />
          </div>
          <Button variant="secondary" onClick={onToday} disabled={data.date === data.today}>
            Today
          </Button>
        </div>
      </div>

      {redirectNotice && (
        <p role="status" className="border-b border-border-subtle bg-info/10 px-3 py-2 text-sm text-text-primary">
          {redirectNotice}
        </p>
      )}

      {pollError && (
        <div role="status" className="flex items-center justify-between gap-2 border-b border-border-subtle bg-warning/10 px-3 py-2 text-sm text-text-primary">
          <span>Couldn&apos;t refresh. Showing data from {formatInstantTime(data.generatedAt, data.timezone)}.</span>
          <button type="button" onClick={onRetry} className="font-semibold text-primary hover:underline">
            Retry
          </button>
        </div>
      )}

      {!selectedInspector && (
        <div className="border-b border-border-subtle p-3">
          <div className="grid grid-cols-4 gap-1.5">
            <SummaryCounter label="Not started" value={data.summary.notStarted} />
            <SummaryCounter label="At a property" value={data.summary.atProperty} />
            <SummaryCounter label="In transit" value={data.summary.inTransit} />
            <SummaryCounter label="Done for the day" value={data.summary.doneForDay} />
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {data.summary.stopsDone} of {data.summary.stopsTotal} stops done
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={needsAttention}
              onClick={onToggleAttention}
              className={cn(
                'inline-flex min-h-[36px] items-center gap-1 rounded border px-2 py-1 text-xs font-semibold',
                needsAttention ? 'border-primary bg-primary/10 text-primary' : 'border-border-subtle text-text-secondary',
              )}
            >
              <i className="mdi mdi-alert-circle-outline text-base leading-none" aria-hidden="true" />
              Needs attention ({data.summary.needsAttention})
            </button>
            <button
              type="button"
              aria-pressed={showAll}
              aria-disabled={!canShowAll}
              title={!canShowAll ? SHOW_ALL_DISABLED_TOOLTIP : undefined}
              onClick={() => {
                if (canShowAll) onToggleShowAll();
              }}
              className={cn(
                'inline-flex min-h-[36px] items-center gap-1 rounded border px-2 py-1 text-xs font-semibold',
                showAll ? 'border-primary bg-primary/10 text-primary' : 'border-border-subtle text-text-secondary',
                !canShowAll && 'cursor-not-allowed opacity-50',
              )}
            >
              <i className="mdi mdi-map-marker-path text-base leading-none" aria-hidden="true" />
              Show all routes
            </button>
          </div>
        </div>
      )}

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
        onPointerEnter={() => onInteractingChange(true)}
        onPointerLeave={() => onInteractingChange(false)}
        onFocus={() => onInteractingChange(true)}
        onBlur={(e) => {
          if (!listRef.current?.contains(e.relatedTarget as Node)) onInteractingChange(false);
        }}
      >
        {selectedInspector ? (
          <LiveDayInspectorDetail
            ref={detailHeadingRef}
            inspector={selectedInspector}
            timezone={data.timezone}
            isPastDay={isPastDay}
            routeLoading={!selectedInspector.geometryIncluded}
            onBack={onBack}
          />
        ) : visibleInspectors.length === 0 ? (
          emptyForAttention ? (
            <EmptyState
              icon="mdi-check-circle-outline"
              title={isPastDay ? `Nobody needed attention on ${dayLabel}.` : 'Nobody needs attention right now.'}
              action={{ label: 'Show everyone', onClick: onShowEveryone }}
            />
          ) : (
            <EmptyState icon="mdi-calendar-blank" title={`No inspectors have work on ${dayLabel}.`} />
          )
        ) : (
          <ul aria-label="Inspectors">
            {visibleInspectors.map((inspector) => (
              <LiveDayInspectorRow
                key={inspector.inspectorId}
                inspector={inspector}
                selected={false}
                isFutureDay={isFutureDay}
                onSelect={() => onSelect(inspector.inspectorId)}
              />
            ))}
          </ul>
        )}
      </div>

      <RouteEtaAccuracyFooter accuracy={eta.accuracy} isLoading={eta.isLoading} isError={eta.isError} />
    </div>
  );
}
