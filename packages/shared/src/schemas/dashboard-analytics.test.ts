import { describe, it, expect } from 'vitest';
import {
  MAX_ANALYTICS_PERIOD_DAYS,
  dashboardAnalyticsQuerySchema,
  dashboardAnalyticsResponseSchema,
  analyticsHeatmapResponseSchema,
} from './dashboard-analytics';

const validAnalytics = {
  period: { startDate: '2026-07-01', endDate: '2026-07-31', granularity: 'day' as const },
  kpis: {
    today: 12,
    thisWeek: 87,
    thisMonth: 341,
    inPeriod: 341,
    cancelledInPeriod: 19,
  },
  statusInPeriod: {
    DRAFT: 4,
    AWAITING_INSPECTOR: 21,
    SCHEDULED: 60,
    DONE: 237,
    CANCELLED: 19,
    REJECTED: 0,
  },
  confirmationRate: { confirmed: 156, eligible: 200 },
  revenue: { amount: 42180.5, currency: 'AUD' },
  evolution: [
    { bucketStart: '2026-07-01', count: 11 },
    { bucketStart: '2026-07-02', count: 14 },
  ],
  serviceTypeDistribution: [
    { serviceTypeId: '11111111-1111-4111-8111-111111111111', code: 'ROUTINE', name: 'Routine Inspection', count: 180 },
  ],
  avgExecutionMinutes: [
    { serviceTypeId: '11111111-1111-4111-8111-111111111111', code: 'ROUTINE', name: 'Routine Inspection', avgMinutes: 42, sampleSize: 120 },
  ],
};

describe('dashboardAnalyticsQuerySchema', () => {
  it('accepts a valid civil-date period', () => {
    const result = dashboardAnalyticsQuerySchema.safeParse({ startDate: '2026-07-01', endDate: '2026-07-31' });
    expect(result.success).toBe(true);
  });

  it('rejects an endDate before startDate', () => {
    const result = dashboardAnalyticsQuerySchema.safeParse({ startDate: '2026-07-31', endDate: '2026-07-01' });
    expect(result.success).toBe(false);
  });

  it('accepts a single-day period (endDate equal to startDate)', () => {
    const result = dashboardAnalyticsQuerySchema.safeParse({ startDate: '2026-07-05', endDate: '2026-07-05' });
    expect(result.success).toBe(true);
  });

  it('rejects an impossible calendar date the regex alone would allow', () => {
    const result = dashboardAnalyticsQuerySchema.safeParse({ startDate: '2026-02-31', endDate: '2026-03-01' });
    expect(result.success).toBe(false);
  });

  it('accepts a period of exactly the maximum length', () => {
    const end = new Date(Date.UTC(2026, 0, 1));
    end.setUTCDate(end.getUTCDate() + MAX_ANALYTICS_PERIOD_DAYS - 1);
    const result = dashboardAnalyticsQuerySchema.safeParse({
      startDate: '2026-01-01',
      endDate: end.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a period one day past the maximum', () => {
    // Unbounded periods are the real risk: for AM/OP the aggregation is
    // unscoped and the heatmap pulls rows, not counts.
    const end = new Date(Date.UTC(2026, 0, 1));
    end.setUTCDate(end.getUTCDate() + MAX_ANALYTICS_PERIOD_DAYS);
    const result = dashboardAnalyticsQuerySchema.safeParse({
      startDate: '2026-01-01',
      endDate: end.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a decade-wide request', () => {
    const result = dashboardAnalyticsQuerySchema.safeParse({
      startDate: '2016-01-01',
      endDate: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non ISO date shape', () => {
    const result = dashboardAnalyticsQuerySchema.safeParse({ startDate: '01/07/2026', endDate: '2026-07-31' });
    expect(result.success).toBe(false);
  });
});

describe('dashboardAnalyticsResponseSchema', () => {
  it('accepts a fully populated payload', () => {
    const result = dashboardAnalyticsResponseSchema.safeParse(validAnalytics);
    expect(result.success).toBe(true);
  });

  it('accepts a null revenue — the flagless CL_USER case, not a 403', () => {
    const result = dashboardAnalyticsResponseSchema.safeParse({ ...validAnalytics, revenue: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.revenue).toBeNull();
  });

  it('accepts a zero-denominator confirmation rate so the web can render a dash', () => {
    const result = dashboardAnalyticsResponseSchema.safeParse({
      ...validAnalytics,
      confirmationRate: { confirmed: 0, eligible: 0 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts weekly granularity', () => {
    const result = dashboardAnalyticsResponseSchema.safeParse({
      ...validAnalytics,
      period: { ...validAnalytics.period, granularity: 'week' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a granularity outside day/week', () => {
    const result = dashboardAnalyticsResponseSchema.safeParse({
      ...validAnalytics,
      period: { ...validAnalytics.period, granularity: 'month' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a null avgMinutes when no execution has finished for that service type', () => {
    const result = dashboardAnalyticsResponseSchema.safeParse({
      ...validAnalytics,
      avgExecutionMinutes: [
        { serviceTypeId: '11111111-1111-4111-8111-111111111111', code: 'ROUTINE', name: 'Routine Inspection', avgMinutes: null, sampleSize: 0 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a negative count in the evolution series', () => {
    const result = dashboardAnalyticsResponseSchema.safeParse({
      ...validAnalytics,
      evolution: [{ bucketStart: '2026-07-01', count: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('requires every appointment status in statusInPeriod', () => {
    const { DONE: _omitted, ...missingDone } = validAnalytics.statusInPeriod;
    const result = dashboardAnalyticsResponseSchema.safeParse({ ...validAnalytics, statusInPeriod: missingDone });
    expect(result.success).toBe(false);
  });
});

describe('analyticsHeatmapResponseSchema', () => {
  it('accepts plotted suburb points alongside the unplottable tally', () => {
    const result = analyticsHeatmapResponseSchema.safeParse({
      points: [{ suburb: 'Newtown', lat: -33.8983, lng: 151.1793, count: 42 }],
      totalPlotted: 42,
      totalWithoutCoordinates: 3,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty heatmap', () => {
    const result = analyticsHeatmapResponseSchema.safeParse({
      points: [],
      totalPlotted: 0,
      totalWithoutCoordinates: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects coordinates outside the geographic range', () => {
    const result = analyticsHeatmapResponseSchema.safeParse({
      points: [{ suburb: 'Nowhere', lat: -99, lng: 151.1793, count: 1 }],
      totalPlotted: 1,
      totalWithoutCoordinates: 0,
    });
    expect(result.success).toBe(false);
  });
});
