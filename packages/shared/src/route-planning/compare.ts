import type { RouteWeights, SequenceEvaluation, WeightTenths } from './types';

/**
 * Integer tenths weights used by the cost function. `round(weight × 10)` keeps
 * the cost deterministic and absorbs binary float error (0.30000000000000004 → 3).
 */
export function toWeightTenths(w: RouteWeights): WeightTenths {
  return {
    travel: Math.round(w.travel * 10),
    windowWait: Math.round(w.windowWait * 10),
    baseProximity: Math.round(w.baseProximity * 10),
  };
}

/**
 * Total order over evaluations, used by every search:
 *   1. lower totalLateS   (feasible always beats infeasible)
 *   2. lower costTenths
 *   3. earlier finishS
 *   4. lexicographically smaller order by the canonical `rank`
 *
 * Returns a negative number when `a` ranks before `b`.
 */
export function compareEvaluations(
  a: SequenceEvaluation,
  b: SequenceEvaluation,
  rank: Map<string, number>,
): number {
  if (a.totalLateS !== b.totalLateS) return a.totalLateS - b.totalLateS;
  if (a.costTenths !== b.costTenths) return a.costTenths - b.costTenths;

  const aFinish = a.finishS ?? 0;
  const bFinish = b.finishS ?? 0;
  if (aFinish !== bFinish) return aFinish - bFinish;

  const len = Math.min(a.order.length, b.order.length);
  for (let i = 0; i < len; i += 1) {
    const ra = rank.get(a.order[i]!) ?? 0;
    const rb = rank.get(b.order[i]!) ?? 0;
    if (ra !== rb) return ra - rb;
  }
  return a.order.length - b.order.length;
}
