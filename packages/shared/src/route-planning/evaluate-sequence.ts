import { toWeightTenths } from './compare';
import { travelAt } from './matrix';
import {
  RouteOrderMismatchError,
  type EvaluatedStop,
  type OptimizerInput,
  type OptimizerStop,
  type SequenceEvaluation,
} from './types';

interface PassStop extends EvaluatedStop {
  /** effective window end (max(windowEndS, windowStartS)) — internal only */
  windowEndEff: number;
}

interface PassResult {
  stops: PassStop[];
  departureS: number | null;
  finishS: number | null;
  firstLegS: number;
  totalTravelS: number;
  totalWaitS: number;
  totalLateS: number;
}

function assertOrderMatchesKeys(stops: OptimizerStop[], order: string[]): void {
  if (order.length !== stops.length) {
    throw new RouteOrderMismatchError();
  }
  const keys = new Set(stops.map((s) => s.key));
  const seen = new Set<string>();
  for (const key of order) {
    if (!keys.has(key) || seen.has(key)) {
      throw new RouteOrderMismatchError();
    }
    seen.add(key);
  }
}

/**
 * One timeline pass for a fixed order, starting as early as possible but with an
 * optional `departureDelay` applied to the first stop (forward slack).
 */
function runPass(
  input: OptimizerInput,
  order: string[],
  stopByKey: Map<string, OptimizerStop>,
  legTravelS: Array<number | null> | undefined,
  departureDelay: number,
): PassResult {
  const { travelS, originIndex, earliestDepartureS } = input;

  let last = originIndex;
  let prevEnd: number | null = null;
  let departureS: number | null = null;
  let firstLegS = 0;
  let firstLegSet = false;
  let totalTravelS = 0;
  let totalWaitS = 0;
  let totalLateS = 0;

  const stops: PassStop[] = order.map((key, i) => {
    const s = stopByKey.get(key)!;
    let leg = 0;
    if (s.matrixIndex !== null && last !== null) {
      leg = legTravelS?.[i] ?? travelAt(travelS, last, s.matrixIndex);
    }

    let arrivalS: number;
    if (i === 0) {
      const baseArrival =
        earliestDepartureS === null
          ? s.windowStartS
          : Math.max(earliestDepartureS + leg, s.windowStartS);
      arrivalS = baseArrival + departureDelay;
      departureS = originIndex !== null ? arrivalS - leg : null;
    } else {
      arrivalS = (prevEnd as number) + leg;
    }

    const windowEndEff = Math.max(s.windowEndS, s.windowStartS);
    const serviceStartS = Math.max(arrivalS, s.windowStartS);
    const waitS = serviceStartS - arrivalS;
    const lateS = Math.max(0, serviceStartS - windowEndEff);
    const serviceEndS = serviceStartS + s.serviceS;

    prevEnd = serviceEndS;
    totalTravelS += leg;
    totalWaitS += waitS;
    totalLateS += lateS;

    if (s.matrixIndex !== null) {
      if (originIndex !== null && !firstLegSet) {
        firstLegS = leg;
        firstLegSet = true;
      }
      last = s.matrixIndex;
    }

    return {
      key,
      sequence: i + 1,
      arrivalS,
      serviceStartS,
      serviceEndS,
      travelS: leg,
      waitS,
      lateS,
      windowEndEff,
    };
  });

  return {
    stops,
    departureS,
    finishS: prevEnd,
    firstLegS,
    totalTravelS,
    totalWaitS,
    totalLateS,
  };
}

/**
 * Largest departure delay that increases no stop's lateness and removes phantom
 * wait: `d = min(ΣwaitS, min₍late=0₎(W_i + windowEnd_i − start_i), min₍late>0₎ W_i)`.
 */
function forwardSlack(pass: PassResult): number {
  let d = pass.totalWaitS;
  let cumWait = 0;
  for (const s of pass.stops) {
    cumWait += s.waitS;
    const term =
      s.lateS === 0 ? cumWait + s.windowEndEff - s.serviceStartS : cumWait;
    if (term < d) d = term;
  }
  return Math.max(0, d);
}

/**
 * Evaluate a fixed order: per-stop arrival/service/wait/late and the plan's
 * departure/finish, with forward slack applied. `opts.legTravelS[i]` overrides
 * leg `i`'s travel (final Directions pass). Throws `RouteOrderMismatchError`
 * when `order` is not exactly the input keys.
 */
export function evaluateSequence(
  input: OptimizerInput,
  order: string[],
  opts?: { legTravelS?: Array<number | null> },
): SequenceEvaluation {
  assertOrderMatchesKeys(input.stops, order);

  if (order.length === 0) {
    return {
      order: [],
      departureS: null,
      finishS: null,
      stops: [],
      totalTravelS: 0,
      totalWaitS: 0,
      totalLateS: 0,
      firstLegS: 0,
      costTenths: 0,
      feasible: true,
      violations: [],
    };
  }

  const stopByKey = new Map(input.stops.map((s) => [s.key, s]));
  const legTravelS = opts?.legTravelS;

  const first = runPass(input, order, stopByKey, legTravelS, 0);
  const d = forwardSlack(first);
  const pass = d > 0 ? runPass(input, order, stopByKey, legTravelS, d) : first;

  const tenths = toWeightTenths(input.weights);
  const costTenths =
    tenths.travel * pass.totalTravelS +
    tenths.windowWait * pass.totalWaitS +
    tenths.baseProximity * pass.firstLegS;

  const stops: EvaluatedStop[] = pass.stops.map(
    ({ windowEndEff: _windowEndEff, ...rest }) => rest,
  );
  const violations = stops
    .filter((s) => s.lateS > 0)
    .map((s) => ({ key: s.key, lateS: s.lateS }));

  return {
    order: [...order],
    departureS: pass.departureS,
    finishS: pass.finishS,
    stops,
    totalTravelS: pass.totalTravelS,
    totalWaitS: pass.totalWaitS,
    totalLateS: pass.totalLateS,
    firstLegS: pass.firstLegS,
    costTenths,
    feasible: pass.totalLateS === 0,
    violations,
  };
}
