import { compareEvaluations, toWeightTenths } from './compare';
import { evaluateSequence } from './evaluate-sequence';
import { travelAt } from './matrix';
import {
  ROUTE_OPTIMIZER_EXACT_MAX_STOPS,
  type OptimizationResult,
  type OptimizerInput,
  type OptimizerStop,
  type SequenceEvaluation,
} from './types';

/** Stops in canonical order: (windowStartS asc, key asc). */
function canonicalStops(stops: OptimizerStop[]): OptimizerStop[] {
  return [...stops].sort(
    (a, b) =>
      a.windowStartS - b.windowStartS || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

function rankMap(canonical: OptimizerStop[]): Map<string, number> {
  return new Map(canonical.map((s, i) => [s.key, i]));
}

/** Lightweight incremental prefix state for the exact search bound. */
interface PrefixState {
  last: number | null;
  prevEnd: number | null;
  firstLegS: number;
  firstLegSet: boolean;
  late: number;
  travel: number;
}

interface StepInfo {
  next: PrefixState;
  leg: number;
  waitS: number;
  lateS: number;
  /** this step set the first origin leg (baseProximity contribution) */
  setFirstLeg: boolean;
}

function initialState(input: OptimizerInput): PrefixState {
  return {
    last: input.originIndex,
    prevEnd: null,
    firstLegS: 0,
    firstLegSet: false,
    late: 0,
    travel: 0,
  };
}

function step(input: OptimizerInput, state: PrefixState, s: OptimizerStop): StepInfo {
  const first = state.prevEnd === null;
  let leg = 0;
  if (s.matrixIndex !== null && state.last !== null) {
    leg = travelAt(input.travelS, state.last, s.matrixIndex);
  }

  let arrivalS: number;
  if (first) {
    arrivalS =
      input.earliestDepartureS === null
        ? s.windowStartS
        : Math.max(input.earliestDepartureS + leg, s.windowStartS);
  } else {
    arrivalS = (state.prevEnd as number) + leg;
  }

  const windowEnd = Math.max(s.windowEndS, s.windowStartS);
  const serviceStartS = Math.max(arrivalS, s.windowStartS);
  const waitS = serviceStartS - arrivalS;
  const lateS = Math.max(0, serviceStartS - windowEnd);

  const setFirstLeg =
    s.matrixIndex !== null && input.originIndex !== null && !state.firstLegSet;

  return {
    next: {
      last: s.matrixIndex !== null ? s.matrixIndex : state.last,
      prevEnd: serviceStartS + s.serviceS,
      firstLegS: setFirstLeg ? leg : state.firstLegS,
      firstLegSet: state.firstLegSet || setFirstLeg,
      late: state.late + lateS,
      travel: state.travel + leg,
    },
    leg,
    waitS,
    lateS,
    setFirstLeg,
  };
}

/**
 * Exact search: DFS over the canonical order with branch-and-bound that never
 * discards a possible optimum, so the result is provably equal to brute force.
 */
function exactSearch(
  input: OptimizerInput,
  canonical: OptimizerStop[],
  rank: Map<string, number>,
): SequenceEvaluation {
  const tenths = toWeightTenths(input.weights);
  const n = canonical.length;
  const used = new Array(n).fill(false);
  const path: string[] = [];
  let best: SequenceEvaluation | null = null;

  const dfs = (state: PrefixState): void => {
    if (best) {
      if (state.late > best.totalLateS) return;
      const bound = tenths.travel * state.travel + tenths.baseProximity * state.firstLegS;
      if (state.late === best.totalLateS && bound > best.costTenths) return;
    }
    if (path.length === n) {
      const evaluation = evaluateSequence(input, [...path]);
      if (!best || compareEvaluations(evaluation, best, rank) < 0) best = evaluation;
      return;
    }
    for (let i = 0; i < n; i += 1) {
      if (used[i]) continue;
      const s = canonical[i]!;
      const info = step(input, state, s);
      used[i] = true;
      path.push(s.key);
      dfs(info.next);
      path.pop();
      used[i] = false;
    }
  };

  dfs(initialState(input));
  return best!;
}

/**
 * Nearest-feasible greedy construction. Exposed for the "heuristic ≥ greedy"
 * proof test; intentionally NOT re-exported from the package barrel.
 */
export function greedyConstructOrder(input: OptimizerInput): string[] {
  const tenths = toWeightTenths(input.weights);
  const canonical = canonicalStops(input.stops);
  const rank = rankMap(canonical);
  const remaining = canonical.map((_, i) => i);
  const order: string[] = [];
  let state = initialState(input);

  while (remaining.length > 0) {
    let bestPos = -1;
    let bestTuple: [number, number, number, number] | null = null;
    let bestNext: PrefixState | null = null;

    for (let p = 0; p < remaining.length; p += 1) {
      const s = canonical[remaining[p]!]!;
      const info = step(input, state, s);
      const increment =
        tenths.travel * info.leg +
        tenths.windowWait * info.waitS +
        (info.setFirstLeg ? tenths.baseProximity * info.leg : 0);
      const tuple: [number, number, number, number] = [
        info.lateS,
        increment,
        Math.max(s.windowEndS, s.windowStartS),
        rank.get(s.key)!,
      ];
      if (bestTuple === null || lexLess(tuple, bestTuple)) {
        bestTuple = tuple;
        bestPos = p;
        bestNext = info.next;
      }
    }

    order.push(canonical[remaining[bestPos]!]!.key);
    state = bestNext!;
    remaining.splice(bestPos, 1);
  }

  return order;
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (ai !== bi) return ai < bi;
  }
  return false;
}

function twoOptSwap(order: string[], i: number, j: number): string[] {
  return [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
}

/**
 * Heuristic: nearest-feasible construction + first-improvement 2-opt (≤ 50
 * sweeps), restarting each sweep on the first strict improvement. Never worse
 * than the greedy construction.
 */
function heuristicSearch(
  input: OptimizerInput,
  rank: Map<string, number>,
): SequenceEvaluation {
  const n = input.stops.length;
  let current = greedyConstructOrder(input);
  let currentEval = evaluateSequence(input, current);

  let improved = true;
  let sweeps = 0;
  while (improved && sweeps < 50) {
    improved = false;
    sweeps += 1;
    for (let i = 0; i < n - 1 && !improved; i += 1) {
      for (let j = i + 1; j < n && !improved; j += 1) {
        const candidate = twoOptSwap(current, i, j);
        const candidateEval = evaluateSequence(input, candidate);
        if (compareEvaluations(candidateEval, currentEval, rank) < 0) {
          current = candidate;
          currentEval = candidateEval;
          improved = true;
        }
      }
    }
  }

  return currentEval;
}

/**
 * Optimize a route. Method by stop count: 0–1 TRIVIAL, 2–8 EXACT (= brute
 * force), ≥ 9 HEURISTIC. `opts.forceMethod` overrides the 2–8/≥9 split (tests
 * only). Deterministic across shuffled inputs and reruns.
 */
export function optimizeRoute(
  input: OptimizerInput,
  opts?: { forceMethod?: 'EXACT' | 'HEURISTIC' },
): OptimizationResult {
  const canonical = canonicalStops(input.stops);
  const rank = rankMap(canonical);
  const n = canonical.length;

  if (n === 0) return { ...evaluateSequence(input, []), method: 'TRIVIAL' };
  if (n === 1) return { ...evaluateSequence(input, [canonical[0]!.key]), method: 'TRIVIAL' };

  const useExact =
    opts?.forceMethod === 'EXACT' ||
    (opts?.forceMethod !== 'HEURISTIC' && n <= ROUTE_OPTIMIZER_EXACT_MAX_STOPS);

  if (useExact) return { ...exactSearch(input, canonical, rank), method: 'EXACT' };
  return { ...heuristicSearch(input, rank), method: 'HEURISTIC' };
}
