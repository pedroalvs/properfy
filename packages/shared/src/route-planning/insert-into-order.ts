import { evaluateSequence } from './evaluate-sequence';
import type {
  OptimizationResult,
  OptimizerInput,
  OptimizerStop,
  SequenceEvaluation,
} from './types';

function canonicalKeys(stops: OptimizerStop[]): string[] {
  return [...stops]
    .sort(
      (a, b) =>
        a.windowStartS - b.windowStartS || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    )
    .map((s) => s.key);
}

/** Cheaper by (totalLateS, costTenths, finishS); ties are not "less" so the earliest position wins. */
function insertionLess(a: SequenceEvaluation, b: SequenceEvaluation): boolean {
  if (a.totalLateS !== b.totalLateS) return a.totalLateS < b.totalLateS;
  if (a.costTenths !== b.costTenths) return a.costTenths < b.costTenths;
  return (a.finishS ?? 0) < (b.finishS ?? 0);
}

/**
 * Cheapest insertion of each new key into the surviving prior order (keys that
 * still exist and are not themselves new), in canonical order. Each key is
 * placed at the position minimizing (totalLateS, costTenths, finishS); ties pick
 * the earliest position. `method` is `'INSERTION'` (or `'FIXED'` when nothing is
 * new). The caller guarantees surviving ∪ newKeys covers every input stop.
 */
export function insertIntoOrder(
  input: OptimizerInput,
  baseOrder: string[],
  newKeys: string[],
): OptimizationResult {
  const stopByKey = new Map(input.stops.map((s) => [s.key, s]));
  const newKeySet = new Set(newKeys);

  let order = baseOrder.filter((k) => stopByKey.has(k) && !newKeySet.has(k));

  const newInCanonical = canonicalKeys(input.stops.filter((s) => newKeySet.has(s.key)));

  const subInputFor = (keys: string[]): OptimizerInput => ({
    ...input,
    stops: keys.map((k) => stopByKey.get(k)!),
  });

  for (const key of newInCanonical) {
    let bestOrder: string[] | null = null;
    let bestEval: SequenceEvaluation | null = null;
    for (let pos = 0; pos <= order.length; pos += 1) {
      const candidate = [...order.slice(0, pos), key, ...order.slice(pos)];
      const evaluation = evaluateSequence(subInputFor(candidate), candidate);
      if (bestEval === null || insertionLess(evaluation, bestEval)) {
        bestEval = evaluation;
        bestOrder = candidate;
      }
    }
    order = bestOrder!;
  }

  return {
    ...evaluateSequence(input, order),
    method: newInCanonical.length > 0 ? 'INSERTION' : 'FIXED',
  };
}
