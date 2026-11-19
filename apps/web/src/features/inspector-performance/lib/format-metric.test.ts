import { describe, it, expect } from 'vitest';
import {
  metricLabel,
  metricDescription,
  formatScore,
  formatReliabilityDate,
  formatReliabilityDateRange,
  formatReliabilityInstant,
  formatMetricValue,
  hasWeightedMinutesTooltip,
  weightedMinutesLabel,
  type MetricValueContext,
} from './format-metric';
import { anaMetrics, makeMetric, COMPUTED_AT } from '../__fixtures__/reliability';

const MEDIAN_CTX: MetricValueContext = { minimumRatings: 3, volumeReferenceSource: 'MEDIAN' };
const byKey = (key: string) => anaMetrics.find((m) => m.metric === key)!;

describe('metric labels & descriptions', () => {
  it('uses the F07-3 UI labels (richer than the shared enum)', () => {
    expect(metricLabel('PUNCTUALITY')).toBe('Punctuality');
    expect(metricLabel('GEOFENCE')).toBe('On-site check-ins');
    expect(metricLabel('NO_STUCK')).toBe('Finished within 6 hours');
    expect(metricLabel('SATISFACTION')).toBe('Tenant satisfaction');
    expect(metricLabel('LATE_NOTICE')).toBe('Late notice given');
    expect(metricLabel('CANT_ATTEND')).toBe('Attendance');
    expect(metricLabel('VOLUME')).toBe('Completed volume');
    expect(metricLabel('DONE_REJECTED')).toBe('Accepted work');
  });

  it('parameterises the satisfaction description with the minimum ratings', () => {
    expect(metricDescription('SATISFACTION', 3)).toContain('at least 3 ratings');
  });
});

describe('formatScore', () => {
  it('always shows one decimal', () => {
    expect(formatScore(100)).toBe('100.0');
    expect(formatScore(89)).toBe('89.0');
    expect(formatScore(97.5)).toBe('97.5');
    expect(formatScore(88.3)).toBe('88.3');
  });
});

describe('date formatters (deterministic D MMM YYYY)', () => {
  it('formats a civil date', () => {
    expect(formatReliabilityDate('2026-11-01')).toBe('1 Nov 2026');
    expect(formatReliabilityDate('2026-12-01')).toBe('1 Dec 2026');
    expect(formatReliabilityDate(null)).toBe('');
  });

  it('formats a same-year range with the year once', () => {
    expect(formatReliabilityDateRange('2026-11-01', '2026-11-30')).toBe('1 Nov – 30 Nov 2026');
  });

  it('formats an instant as a Sydney civil date + wall time', () => {
    expect(formatReliabilityInstant(COMPUTED_AT)).toBe('1 Dec 2026, 4:15 am');
  });
});

describe('formatMetricValue', () => {
  it('formats the eight worked-example metrics', () => {
    expect(formatMetricValue(byKey('PUNCTUALITY'), MEDIAN_CTX)).toEqual({
      primary: '83%',
      detail: '10 of 12 services',
      isNoData: false,
    });
    expect(formatMetricValue(byKey('GEOFENCE'), MEDIAN_CTX)).toMatchObject({ primary: '92%', detail: '11 of 12 inspections' });
    expect(formatMetricValue(byKey('NO_STUCK'), MEDIAN_CTX)).toMatchObject({ primary: '100%', detail: '12 of 12 inspections' });
    expect(formatMetricValue(byKey('SATISFACTION'), MEDIAN_CTX)).toMatchObject({ primary: '4.25 / 5', detail: '4 ratings' });
    expect(formatMetricValue(byKey('LATE_NOTICE'), MEDIAN_CTX)).toMatchObject({ primary: '50%', detail: '1 of 2 late arrivals' });
    expect(formatMetricValue(byKey('CANT_ATTEND'), MEDIAN_CTX)).toMatchObject({ primary: '100%', detail: '0 dropped of 12' });
    expect(formatMetricValue(byKey('VOLUME'), MEDIAN_CTX)).toMatchObject({ primary: '100%', detail: '12 completed · median 9.5' });
    expect(formatMetricValue(byKey('DONE_REJECTED'), MEDIAN_CTX)).toMatchObject({ primary: '100%', detail: '0 not carried out of 12' });
  });

  it('shows "Not enough ratings" when satisfaction is below the minimum', () => {
    const metric = makeMetric('SATISFACTION', { rate: null, eligibleCount: 1, successCount: null, averageRating: null });
    expect(formatMetricValue(metric, MEDIAN_CTX)).toEqual({
      primary: 'Not enough ratings',
      detail: '1 of 3 needed',
      isNoData: true,
    });
  });

  it('shows "No data" for a null metric with its per-metric reason', () => {
    const late = makeMetric('LATE_NOTICE', { rate: null, eligibleCount: 0, successCount: null });
    expect(formatMetricValue(late, MEDIAN_CTX)).toEqual({
      primary: 'No data',
      detail: 'No late arrivals in this period',
      isNoData: true,
    });
    const sat = makeMetric('SATISFACTION', { rate: null, eligibleCount: 0, successCount: null, averageRating: null });
    expect(formatMetricValue(sat, MEDIAN_CTX)).toMatchObject({ primary: 'No data', detail: 'No ratings in this period' });
  });

  it('labels an override volume reference as fixed', () => {
    const volume = makeMetric('VOLUME', { rate: 1, successCount: 12, volumeReference: 20, activeDays: 30 });
    expect(formatMetricValue(volume, { minimumRatings: 3, volumeReferenceSource: 'OVERRIDE' })).toMatchObject({
      detail: '12 completed · reference 20 (fixed)',
    });
  });

  it('shows the pro-rata volume phrasing when activeDays is below the window', () => {
    const volume = makeMetric('VOLUME', { rate: 0.25, successCount: 2, volumeReference: 20, activeDays: 12 });
    expect(formatMetricValue(volume, { minimumRatings: 3, volumeReferenceSource: 'OVERRIDE' })).toMatchObject({
      detail: '2 completed in 12 days · reference 20 (fixed) / 30 days',
    });
  });
});

describe('weighted-minutes tooltip', () => {
  it('is present for every metric except satisfaction and volume', () => {
    expect(hasWeightedMinutesTooltip('PUNCTUALITY')).toBe(true);
    expect(hasWeightedMinutesTooltip('CANT_ATTEND')).toBe(true);
    expect(hasWeightedMinutesTooltip('SATISFACTION')).toBe(false);
    expect(hasWeightedMinutesTooltip('VOLUME')).toBe(false);
  });

  it('labels the weighted minutes', () => {
    expect(weightedMinutesLabel(byKey('PUNCTUALITY'))).toBe('500 of 600 weighted minutes');
  });
});
