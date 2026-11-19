import { useMemo, useState } from 'react';
import { cn } from '@properfy/frontend-standards';
import { SelectInput } from '@/components/forms/SelectInput';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLockedTime } from '../hooks/useLockedTime';
import {
  DEFAULT_LOCKED_TIME_PERIOD,
  LOCKED_TIME_PERIODS,
  formatLockedPercent,
  lockedTimeRangeLabel,
  regionCellLabel,
  sortByLocked,
} from '../lib/lockedTimeView';

const HELP_TEXT =
  'Share of inspections that need the tenant to confirm and are already confirmed.';

const PERIOD_OPTIONS = LOCKED_TIME_PERIODS.map((days) => ({
  value: String(days),
  label: `Next ${days} days`,
}));

interface LockedTableRow {
  key: string;
  label: string;
  confirmed: number;
  required: number;
  percent: number | null;
  pinned: boolean;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** A horizontal bar (decorative) + the percent text, or "—" when nothing needs confirming. */
function LockedCell({ percent }: { percent: number | null }) {
  if (percent === null) {
    return (
      <span aria-label="No inspections need confirmation" className="text-text-muted">
        —
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded bg-app-bg">
        <span className="block h-full rounded bg-primary" style={{ width: `${clampPercent(percent)}%` }} />
      </span>
      <span className="tabular-nums">{formatLockedPercent(percent)}</span>
    </span>
  );
}

/**
 * Compact, accessible locked-share table. Sort is controlled here (not via the
 * generic `DataTable`) because the "No region" row must stay last in every sort
 * direction (L-F05-13) — a per-row pin the shared table can't express.
 */
function LockedTable({
  caption,
  firstColLabel,
  rows,
}: {
  caption: string;
  firstColLabel: string;
  rows: LockedTableRow[];
}) {
  const [dir, setDir] = useState<'asc' | 'desc' | null>(null);
  const sorted = useMemo(() => sortByLocked(rows, dir, (r) => r.pinned), [rows, dir]);
  const ariaSort = dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none';

  return (
    <div className="overflow-x-auto rounded-md border border-border-subtle">
      <table className="w-full border-collapse text-table-body">
        <caption className="px-3 pt-3 text-left text-sm font-bold text-text-secondary">{caption}</caption>
        <thead>
          <tr className="border-b border-border-subtle">
            <th scope="col" className="px-3 py-2 text-left text-table-header text-text-secondary">
              {firstColLabel}
            </th>
            <th scope="col" aria-sort={ariaSort} className="px-3 py-2 text-left text-table-header text-text-secondary">
              <button
                type="button"
                onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="inline-flex items-center gap-1 border-0 bg-transparent p-0 [font:inherit] text-inherit hover:text-text-primary"
              >
                Locked
                {dir && (
                  <i
                    aria-hidden="true"
                    className={cn('mdi text-xs', dir === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down')}
                  />
                )}
              </button>
            </th>
            <th scope="col" className="px-3 py-2 text-left text-table-header text-text-secondary">
              Confirmed / Required
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.key} className="border-b border-border-light last:border-b-0 text-text-primary">
              <td className="px-3 py-2">
                <span className="block max-w-[180px] truncate" title={row.label} aria-label={row.label}>
                  {row.label}
                </span>
              </td>
              <td className="px-3 py-2">
                <LockedCell percent={row.percent} />
              </td>
              <td className="px-3 py-2 tabular-nums">
                {row.confirmed} / {row.required}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" data-testid="locked-time-skeleton">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-4 w-24 animate-pulse rounded bg-app-bg" />
          <div className="h-24 animate-pulse rounded bg-app-bg" />
        </div>
      ))}
    </div>
  );
}

interface LockedTimeSectionProps {
  /** The Live Day server-side civil today — the range anchor (L-F05-09). */
  today: string;
}

/**
 * The "Locked time" tab (01.13): the confirmed share of tenant-confirmation
 * inspections over a 7/14/30-day period starting today, by agency and by region.
 * Read-only; never polls.
 */
export function LockedTimeSection({ today }: LockedTimeSectionProps) {
  const [period, setPeriod] = useState<number>(DEFAULT_LOCKED_TIME_PERIOD);
  const { data, range, isLoading, isError, refetch } = useLockedTime(today, period);

  const agencyRows = useMemo<LockedTableRow[]>(
    () =>
      (data?.byAgency ?? []).map((row) => ({
        key: row.tenantId,
        label: row.agencyName,
        confirmed: row.confirmed,
        required: row.required,
        percent: row.percent,
        pinned: false,
      })),
    [data],
  );

  const regionRows = useMemo<LockedTableRow[]>(
    () =>
      (data?.byRegion ?? []).map((row) => ({
        key: row.regionId ?? 'no-region',
        label: regionCellLabel(row),
        confirmed: row.confirmed,
        required: row.required,
        percent: row.percent,
        pinned: row.regionId === null,
      })),
    [data],
  );

  return (
    <div className="flex flex-col gap-4 p-3">
      <div>
        <h2 className="text-lg font-bold text-secondary">Locked time</h2>
        <p className="text-sm text-text-secondary">{HELP_TEXT}</p>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">
          <label htmlFor="locked-time-period">Period</label>
          <div className="w-40">
            <SelectInput
              id="locked-time-period"
              aria-label="Period"
              value={String(period)}
              onChange={(v) => setPeriod(Number(v))}
              options={PERIOD_OPTIONS}
            />
          </div>
        </div>
        <p className="pb-2 text-sm text-text-secondary">{lockedTimeRangeLabel(range.from, range.to)}</p>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : isError || !data ? (
        <EmptyState
          icon="mdi-alert-circle-outline"
          title="We couldn't load locked time."
          action={{ label: 'Try again', onClick: refetch }}
        />
      ) : data.overall.required === 0 ? (
        <EmptyState
          icon="mdi-calendar-check-outline"
          title="No inspections need tenant confirmation in this period."
        />
      ) : (
        <>
          <div className="rounded-md bg-app-bg p-3">
            <p className="text-sm font-semibold text-text-primary">
              Overall: {formatLockedPercent(data.overall.percent)} locked ({data.overall.confirmed} of{' '}
              {data.overall.required})
            </p>
            <div
              role="meter"
              aria-label="Overall locked time"
              aria-valuenow={data.overall.percent ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-2 h-2 overflow-hidden rounded bg-card-bg"
            >
              <div
                className="h-full rounded bg-primary"
                style={{ width: `${clampPercent(data.overall.percent ?? 0)}%` }}
              />
            </div>
          </div>

          <LockedTable caption="By agency" firstColLabel="Agency" rows={agencyRows} />
          <LockedTable caption="By region" firstColLabel="Region" rows={regionRows} />
        </>
      )}
    </div>
  );
}
