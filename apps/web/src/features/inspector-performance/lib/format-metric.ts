import {
  ReliabilityMetricKey,
  RELIABILITY_WINDOW_DAYS,
  civilDateInTz,
  formatInstantTime,
  formatRatingAverage,
  PLATFORM_TIMEZONE,
  type ReliabilityMetricResult,
} from '@properfy/shared';

/**
 * Display copy and value formatting for the Inspector performance screen (F07-3).
 *
 * The shared `RELIABILITY_METRIC_LABELS`/`DESCRIPTIONS` are deliberately terse
 * (F08 also consumes them); the shared enum's own comment delegates the final UI
 * copy to this task. So the exact labels, descriptions, units and "No data"
 * strings live here, matching the TASK-F07-3 UI table verbatim, without mutating
 * the shared enum.
 */
export const METRIC_LABELS: Record<ReliabilityMetricKey, string> = {
  PUNCTUALITY: 'Punctuality',
  GEOFENCE: 'On-site check-ins',
  NO_STUCK: 'Finished within 6 hours',
  SATISFACTION: 'Tenant satisfaction',
  LATE_NOTICE: 'Late notice given',
  CANT_ATTEND: 'Attendance',
  VOLUME: 'Completed volume',
  DONE_REJECTED: 'Accepted work',
};

export function metricLabel(key: ReliabilityMetricKey): string {
  return METRIC_LABELS[key];
}

export function metricDescription(key: ReliabilityMetricKey, minimumRatings: number): string {
  switch (key) {
    case 'PUNCTUALITY':
      return 'Check-ins within the booked window or the planned arrival time.';
    case 'GEOFENCE':
      return 'Check-ins and check-outs within the property radius.';
    case 'NO_STUCK':
      return 'Inspections finished within 6 hours of check-in.';
    case 'SATISFACTION':
      return `Average tenant rating (1–5 stars). Needs at least ${minimumRatings} ratings.`;
    case 'LATE_NOTICE':
      return 'Late arrivals the inspector warned about before the planned arrival time (or before the booked window, when there is no route plan).';
    case 'CANT_ATTEND':
      return 'Jobs not dropped with "I can\'t attend" and not marked as "Inspector didn\'t attend".';
    case 'VOLUME':
      return "Completed inspections compared with the median of active inspectors in the same 30 days, adjusted for inspectors who joined during the period.";
    case 'DONE_REJECTED':
      return 'Completed inspections later found not carried out.';
  }
}

/** The score comes pre-rounded to one decimal from the backend; render it as such (incl. "100.0"). */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

interface CivilParts {
  year: number;
  month: number;
  day: number;
}

function parseCivil(value: string): CivilParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * Renders a civil date as `D MMM YYYY` (e.g. "1 Nov 2026") from a fixed month
 * array — deterministic across Node/ICU versions, unlike `toLocaleDateString`
 * (memory `project_icu_locale_default_date_format_node_version_drift`). The
 * shared `formatCivilDate` yields `dd/mm/yyyy`, which this screen's copy avoids.
 */
export function formatReliabilityDate(value: string | null | undefined): string {
  if (!value) return '';
  const parts = parseCivil(value);
  if (!parts || parts.month < 1 || parts.month > 12) return value;
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

/** "1 Nov – 30 Nov 2026" (year shown once when both ends share it). */
export function formatReliabilityDateRange(
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  if (!from || !to) return '';
  const a = parseCivil(from);
  const b = parseCivil(to);
  if (!a || !b) return `${formatReliabilityDate(from)} – ${formatReliabilityDate(to)}`;
  if (a.year === b.year) {
    return `${a.day} ${MONTHS[a.month - 1]} – ${b.day} ${MONTHS[b.month - 1]} ${b.year}`;
  }
  return `${formatReliabilityDate(from)} – ${formatReliabilityDate(to)}`;
}

/** "1 Dec 2026, 4:15 am" — a Sydney civil date plus the Sydney wall time of the instant. */
export function formatReliabilityInstant(value: string | null | undefined): string {
  if (!value) return '';
  const civil = civilDateInTz(new Date(value), PLATFORM_TIMEZONE);
  return `${formatReliabilityDate(civil)}, ${formatInstantTime(value, PLATFORM_TIMEZONE)}`;
}

export interface MetricValue {
  /** The headline value ("83%", "4.25 / 5", "Not enough ratings", or "No data"). */
  primary: string;
  /** The secondary line ("10 of 12 services", "4 ratings", "No late arrivals in this period"). */
  detail: string;
  /** True when the metric has no eligible data (or is below its minimum) and is dropped from the score. */
  isNoData: boolean;
}

const PERCENT_UNIT: Partial<Record<ReliabilityMetricKey, string>> = {
  PUNCTUALITY: 'services',
  GEOFENCE: 'inspections',
  NO_STUCK: 'inspections',
  LATE_NOTICE: 'late arrivals',
};

const NO_DATA_DETAIL: Record<ReliabilityMetricKey, string> = {
  PUNCTUALITY: 'No services to evaluate',
  GEOFENCE: 'No location data in this period',
  NO_STUCK: 'No finished inspections in this period',
  SATISFACTION: 'No ratings in this period',
  LATE_NOTICE: 'No late arrivals in this period',
  CANT_ATTEND: 'No jobs taken on in this period',
  VOLUME: 'No completed inspections in this period',
  DONE_REJECTED: 'No completed inspections in this period',
};

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatReference(value: number): string {
  return String(value);
}

export interface MetricValueContext {
  minimumRatings: number;
  volumeReferenceSource: 'MEDIAN' | 'OVERRIDE' | null;
}

/**
 * The displayed value + detail line for one metric, by key. Percentages are
 * `Math.round(rate × 100)`; the 4-decimal rate is never shown raw.
 */
export function formatMetricValue(
  metric: ReliabilityMetricResult,
  ctx: MetricValueContext,
): MetricValue {
  const key = metric.metric;

  if (key === ReliabilityMetricKey.SATISFACTION) {
    if (metric.rate === null) {
      if (metric.eligibleCount > 0) {
        return {
          primary: 'Not enough ratings',
          detail: `${metric.eligibleCount} of ${ctx.minimumRatings} needed`,
          isNoData: true,
        };
      }
      return { primary: 'No data', detail: NO_DATA_DETAIL.SATISFACTION, isNoData: true };
    }
    const average = formatRatingAverage(metric.averageRating) ?? '—';
    return {
      primary: `${average} / 5`,
      detail: `${metric.eligibleCount} ratings`,
      isNoData: false,
    };
  }

  if (key === ReliabilityMetricKey.VOLUME) {
    if (metric.rate === null || metric.volumeReference === null) {
      return { primary: 'No data', detail: NO_DATA_DETAIL.VOLUME, isNoData: true };
    }
    const ref = formatReference(metric.volumeReference);
    const refText = ctx.volumeReferenceSource === 'OVERRIDE' ? `reference ${ref} (fixed)` : `median ${ref}`;
    const completed = metric.successCount ?? metric.volume;
    const proRata = metric.activeDays !== null && metric.activeDays < RELIABILITY_WINDOW_DAYS;
    const detail = proRata
      ? `${completed} completed in ${metric.activeDays} days · ${refText} / ${RELIABILITY_WINDOW_DAYS} days`
      : `${completed} completed · ${refText}`;
    return { primary: percent(metric.rate), detail, isNoData: false };
  }

  if (key === ReliabilityMetricKey.CANT_ATTEND) {
    if (metric.rate === null) {
      return { primary: 'No data', detail: NO_DATA_DETAIL.CANT_ATTEND, isNoData: true };
    }
    const dropped = metric.eligibleCount - (metric.successCount ?? metric.eligibleCount);
    return {
      primary: percent(metric.rate),
      detail: `${dropped} dropped of ${metric.eligibleCount}`,
      isNoData: false,
    };
  }

  if (key === ReliabilityMetricKey.DONE_REJECTED) {
    if (metric.rate === null) {
      return { primary: 'No data', detail: NO_DATA_DETAIL.DONE_REJECTED, isNoData: true };
    }
    const notCarried = metric.eligibleCount - (metric.successCount ?? metric.eligibleCount);
    return {
      primary: percent(metric.rate),
      detail: `${notCarried} not carried out of ${metric.eligibleCount}`,
      isNoData: false,
    };
  }

  // Plain percentage metrics: PUNCTUALITY, GEOFENCE, NO_STUCK, LATE_NOTICE.
  if (metric.rate === null) {
    return { primary: 'No data', detail: NO_DATA_DETAIL[key], isNoData: true };
  }
  const unit = PERCENT_UNIT[key] ?? 'services';
  return {
    primary: percent(metric.rate),
    detail: `${metric.successCount ?? 0} of ${metric.eligibleCount} ${unit}`,
    isNoData: false,
  };
}

/** The weighted-minutes tooltip is shown for every metric except satisfaction and volume. */
export function hasWeightedMinutesTooltip(key: ReliabilityMetricKey): boolean {
  return key !== ReliabilityMetricKey.SATISFACTION && key !== ReliabilityMetricKey.VOLUME;
}

export function weightedMinutesLabel(metric: ReliabilityMetricResult): string {
  return `${metric.weightedSuccess} of ${metric.weightedEligible} weighted minutes`;
}
