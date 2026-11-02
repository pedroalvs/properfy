/**
 * Shared Mapbox call budget (F04, D16/D17). The limiter state lives in Postgres,
 * not in process, because the publication workers run inside the API process and
 * Fly runs a second machine under load — a per-process bucket would double the
 * real call rate past Mapbox's per-token (per-environment) ceiling. One bucket
 * per profile; the row lock of the atomic UPDATE serializes the machines.
 */

export type RoutingRateBucket =
  | 'matrix:driving-traffic'
  | 'matrix:driving'
  | 'directions';

export interface IRoutingRateLimiter {
  /**
   * Takes 1 token, waiting up to `maxWaitMs` (polling every 250 ms).
   * Returns `false` when the budget is not available within the wait.
   */
  acquire(bucket: RoutingRateBucket, maxWaitMs: number): Promise<boolean>;
  /** Empties the bucket (after a provider 429) so every instance backs off. */
  drain(bucket: RoutingRateBucket): Promise<void>;
}
