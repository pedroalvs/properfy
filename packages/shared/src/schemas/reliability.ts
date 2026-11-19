import { z } from 'zod';
import { ReliabilityMetricKey, RELIABILITY_FAILURES_MAX } from '../enums/reliability';
import { civilDateSchema } from './civil-date';
import { instantStr } from './responses';

/**
 * One reliability metric's computed result (F07-1). Shared because it is both the
 * shape stored in the F07-2 snapshot `metrics_json` and the shape the AM/OP API
 * returns. `rate` is "higher is better", 0–1, 4 decimals; a `null` rate means the
 * metric has no eligible services (or is below its minimum) and is dropped from
 * the score. Weighted sums are in minutes. No coordinate is ever carried.
 */
export const reliabilityMetricFailureSchema = z.object({
  appointmentId: z.string().uuid(),
  serviceDate: civilDateSchema,
  /** English, no address/coordinate/agency name. */
  detail: z.string().max(80),
});
export type ReliabilityMetricFailure = z.infer<typeof reliabilityMetricFailureSchema>;

export const reliabilityMetricResultSchema = z.object({
  metric: z.nativeEnum(ReliabilityMetricKey),
  rate: z.number().min(0).max(1).nullable(),
  eligibleCount: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative().nullable(),
  averageRating: z.number().nullable(),
  volumeReference: z.number().positive().nullable(),
  weightedSuccess: z.number().nonnegative(),
  weightedEligible: z.number().nonnegative(),
  volume: z.number().int().nonnegative(),
  activeDays: z.number().int().nonnegative().nullable(),
  failureCount: z.number().int().nonnegative(),
  failures: z.array(reliabilityMetricFailureSchema).max(RELIABILITY_FAILURES_MAX),
});
export type ReliabilityMetricResult = z.infer<typeof reliabilityMetricResultSchema>;

/**
 * Score status as exposed by the F07-2 detail API. Extends the three stored
 * statuses (`ReliabilityScoreStatus`) with `NOT_COMPUTED` — an API-only state
 * meaning the inspector has no row in the latest snapshot (never persisted).
 */
export const reliabilityDetailStatusSchema = z.enum([
  'SCORED',
  'INSUFFICIENT_VOLUME',
  'NO_WEIGHTED_DATA',
  'NOT_COMPUTED',
]);
export type ReliabilityDetailStatus = z.infer<typeof reliabilityDetailStatusSchema>;

const volumeReferenceSourceSchema = z.enum(['MEDIAN', 'OVERRIDE']);

const rankedInspectorSchema = z.object({
  position: z.number().int().positive(),
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  score: z.number().min(0).max(100),
  volume: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
});

const notEnoughDataInspectorSchema = z.object({
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  volume: z.number().int().nonnegative(),
  status: z.enum(['INSUFFICIENT_VOLUME', 'NO_WEIGHTED_DATA']),
});

/**
 * AM/OP reliability ranking (F07-2, `GET /v1/dashboard/inspector-performance`).
 * Built from the latest snapshot. `isStale` (snapshot older than today, Sydney)
 * and `settingsUpdatedAt` (`reliabilityIndex` `updated_at`) are freshness signals.
 * Nullable snapshot metadata means no snapshot exists yet.
 */
export const reliabilityRankingResponseSchema = z.object({
  snapshotDate: civilDateSchema.nullable(),
  windowFrom: civilDateSchema.nullable(),
  windowTo: civilDateSchema.nullable(),
  computedAt: instantStr().nullable(),
  isStale: z.boolean(),
  settingsUpdatedAt: instantStr().nullable(),
  minimumVolume: z.number().int().positive(),
  volumeReference: z.number().positive().nullable(),
  volumeReferenceSource: volumeReferenceSourceSchema.nullable(),
  ranked: z.array(rankedInspectorSchema),
  notEnoughData: z.array(notEnoughDataInspectorSchema),
});
export type ReliabilityRankingResponse = z.infer<typeof reliabilityRankingResponseSchema>;

/**
 * AM/OP reliability detail (F07-2, `GET /v1/dashboard/inspector-performance/:inspectorId`).
 * The eight metrics (canonical order) each carry the `weight` from the snapshot's
 * `settings_json` that produced the stored score. `NOT_COMPUTED` → `metrics []`.
 */
export const inspectorReliabilityResponseSchema = z.object({
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  inspectorStatus: z.enum(['ACTIVE', 'INACTIVE']),
  status: reliabilityDetailStatusSchema,
  snapshotDate: civilDateSchema.nullable(),
  windowFrom: civilDateSchema.nullable(),
  windowTo: civilDateSchema.nullable(),
  computedAt: instantStr().nullable(),
  isStale: z.boolean(),
  settingsUpdatedAt: instantStr().nullable(),
  score: z.number().min(0).max(100).nullable(),
  position: z.number().int().positive().nullable(),
  rankedCount: z.number().int().nonnegative(),
  volume: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  minimumVolume: z.number().int().positive(),
  minimumRatings: z.number().int().positive(),
  volumeReference: z.number().positive().nullable(),
  volumeReferenceSource: volumeReferenceSourceSchema.nullable(),
  metrics: z.array(reliabilityMetricResultSchema.extend({ weight: z.number().int().min(0).max(10) })),
});
export type InspectorReliabilityResponse = z.infer<typeof inspectorReliabilityResponseSchema>;

export const inspectorReliabilityParamsSchema = z.object({ inspectorId: z.string().uuid() });
export type InspectorReliabilityParams = z.infer<typeof inspectorReliabilityParamsSchema>;
