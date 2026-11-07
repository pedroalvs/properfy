import { z } from 'zod';
import { ReliabilityMetricKey, RELIABILITY_FAILURES_MAX } from '../enums/reliability';
import { civilDateSchema } from './civil-date';

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
