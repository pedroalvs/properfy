import { STUCK_THRESHOLD_HOURS } from '../../inspector-execution/domain/stuck-execution';
import type { ServiceFact } from './service-fact';

export type NoStuckResult = 'OK' | 'STUCK' | 'EXCLUDED';

const STUCK_THRESHOLD_MS = STUCK_THRESHOLD_HOURS * 60 * 60 * 1000;

/**
 * Metric 3 — "finished without getting stuck" (P3). Equivalent to "did not reach
 * the 6-hour stuck-alert threshold", without depending on whether an alert was
 * actually sent. Only own, finished, non-reopened executions are eligible: a
 * reopened execution (`resumedAt` set) is excluded because the original
 * `startedAt` would inflate the duration. A restarted execution (F03 D13) keeps
 * `resumedAt` null and carries the restart `startedAt`, so it is measured from
 * the restart.
 */
export function evaluateNoStuck(fact: ServiceFact): NoStuckResult {
  if (fact.kind !== 'EXECUTED') return 'EXCLUDED';
  if (fact.resumedAt) return 'EXCLUDED';
  if (!fact.startedAt || !fact.finishedAt) return 'EXCLUDED';
  const durationMs = fact.finishedAt.getTime() - fact.startedAt.getTime();
  return durationMs > STUCK_THRESHOLD_MS ? 'STUCK' : 'OK';
}
