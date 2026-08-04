import { z } from 'zod';
import { AppointmentStatus } from '../enums/appointment';
import { civilDateSchema } from './civil-date';

/**
 * Contracts for the Analytics screen (client scope §4.1) — the KPI / chart /
 * heatmap layer that `GET /v1/dashboard/stats` deliberately does not carry.
 *
 * Split across two endpoints: the analytics payload below, and the heatmap,
 * whose cardinality is a function of how many distinct suburbs the period
 * touches rather than of a fixed field list.
 */

/** Bucket width of the evolution series. Widens to `week` on long periods. */
export const analyticsGranularitySchema = z.enum(['day', 'week']);
export type AnalyticsGranularity = z.infer<typeof analyticsGranularitySchema>;

/**
 * Longest period the analytics endpoints will aggregate, inclusive.
 *
 * A bound is required, not cosmetic: for AM/OP the aggregation is unscoped, and
 * the heatmap and execution-duration reads pull rows rather than counts. Without
 * a ceiling, a decade-wide request would load every appointment on the platform
 * into memory. A year covers every question the screen can ask — the widest
 * preset is a quarter — and keeps the read bounded.
 */
export const MAX_ANALYTICS_PERIOD_DAYS = 366;

export const dashboardAnalyticsQuerySchema = z
  .object({
    startDate: civilDateSchema,
    endDate: civilDateSchema,
  })
  .refine((q) => q.endDate >= q.startDate, {
    message: 'endDate must be >= startDate',
    path: ['endDate'],
  })
  .refine(
    (q) =>
      (Date.parse(`${q.endDate}T00:00:00.000Z`) - Date.parse(`${q.startDate}T00:00:00.000Z`)) /
        86_400_000 +
        1 <=
      MAX_ANALYTICS_PERIOD_DAYS,
    {
      message: `Period must not exceed ${MAX_ANALYTICS_PERIOD_DAYS} days`,
      path: ['endDate'],
    },
  );

export type DashboardAnalyticsQuery = z.infer<typeof dashboardAnalyticsQuerySchema>;

const countSchema = z.number().int().nonnegative();

const serviceTypeRefSchema = {
  serviceTypeId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
};

export const dashboardAnalyticsResponseSchema = z.object({
  /** Echoes the resolved period so the client never has to re-derive the bucket width. */
  period: z.object({
    startDate: civilDateSchema,
    endDate: civilDateSchema,
    granularity: analyticsGranularitySchema,
  }),
  /**
   * `today` / `thisWeek` / `thisMonth` are absolute Sydney-calendar windows and
   * ignore the selected period — §4.1 asks for them as standing indicators.
   * `inPeriod` / `cancelledInPeriod` follow the filter.
   */
  kpis: z.object({
    today: countSchema,
    thisWeek: countSchema,
    thisMonth: countSchema,
    inPeriod: countSchema,
    cancelledInPeriod: countSchema,
  }),
  /** Every status is always present, zero-filled — a missing key would read as "no data". */
  statusInPeriod: z.object({
    [AppointmentStatus.DRAFT]: countSchema,
    [AppointmentStatus.AWAITING_INSPECTOR]: countSchema,
    [AppointmentStatus.SCHEDULED]: countSchema,
    [AppointmentStatus.DONE]: countSchema,
    [AppointmentStatus.CANCELLED]: countSchema,
    [AppointmentStatus.REJECTED]: countSchema,
  }),
  /**
   * Numerator and denominator, not a percentage: `eligible` counts only the
   * appointments whose service type requires rental-tenant confirmation, and a
   * zero denominator must render as "—" rather than as 0% or NaN.
   */
  confirmationRate: z.object({
    confirmed: countSchema,
    eligible: countSchema,
  }),
  /**
   * `null` — not a 403 — when the actor may not read financials, so the rest of
   * the screen still renders for a CL_USER without the `view_financials` flag.
   */
  revenue: z
    .object({
      amount: z.number(),
      currency: z.string().length(3),
    })
    .nullable(),
  evolution: z.array(
    z.object({
      /** First civil date of the bucket; equals the day itself at `day` granularity. */
      bucketStart: civilDateSchema,
      count: countSchema,
    }),
  ),
  serviceTypeDistribution: z.array(z.object({ ...serviceTypeRefSchema, count: countSchema })),
  avgExecutionMinutes: z.array(
    z.object({
      ...serviceTypeRefSchema,
      /** `null` when no execution of this service type finished inside the period. */
      avgMinutes: z.number().nonnegative().nullable(),
      sampleSize: countSchema,
    }),
  ),
});

export type DashboardAnalyticsResponse = z.infer<typeof dashboardAnalyticsResponseSchema>;

export const analyticsHeatmapResponseSchema = z.object({
  points: z.array(
    z.object({
      suburb: z.string(),
      /** Centroid of the suburb's geocoded properties, averaged over the period's appointments. */
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      count: countSchema,
    }),
  ),
  totalPlotted: countSchema,
  /**
   * Appointments the heatmap had to drop because their property is not geocoded.
   * Surfaced so the screen can say so instead of quietly under-reporting.
   */
  totalWithoutCoordinates: countSchema,
});

export type AnalyticsHeatmapResponse = z.infer<typeof analyticsHeatmapResponseSchema>;
