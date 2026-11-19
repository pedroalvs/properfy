import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  selectMatrixProfile,
  toWeightTenths,
  evaluateSequence,
  optimizeRoute,
  insertIntoOrder,
  compareEvaluations,
  RouteOrderMismatchError,
  DEFAULT_ROUTE_WEIGHTS,
  type OptimizerInput,
  type OptimizerStop,
  type RouteWeights,
  type SequenceEvaluation,
} from './index';
import { greedyConstructOrder } from './optimize-route';

// ---------------------------------------------------------------------------
// Fixtures. Time is relative seconds: T0 = 08:00 local = 0 s. Default service
// 45 min = 2700 s. Default weights {1,1,1}. Indices O=0, A=1, B=2, C=3.
// ---------------------------------------------------------------------------

const SERVICE = 2700;
const OPEN = 32400; // 17:00 - 08:00 = 9 h

/** The "line" matrix: O–A–B–C colinear, symmetric. */
const lineMatrix = [
  [0, 600, 1200, 1800],
  [600, 0, 600, 1200],
  [1200, 600, 0, 600],
  [1800, 1200, 600, 0],
];

function stop(
  key: string,
  windowStartS: number,
  windowEndS: number,
  matrixIndex: number | null,
  serviceS = SERVICE,
): OptimizerStop {
  return { key, windowStartS, windowEndS, serviceS, matrixIndex };
}

function input(
  stops: OptimizerStop[],
  travelS: number[][],
  originIndex: number | null,
  opts: { earliestDepartureS?: number | null; weights?: RouteWeights } = {},
): OptimizerInput {
  return {
    stops,
    travelS,
    originIndex,
    earliestDepartureS: opts.earliestDepartureS ?? null,
    weights: opts.weights ?? DEFAULT_ROUTE_WEIGHTS,
  };
}

const byKey = (e: { stops: Array<{ key: string }> }, k: string) =>
  e.stops.find((s) => s.key === k)!;

// ---------------------------------------------------------------------------
// Test 21 — haversineMeters
// ---------------------------------------------------------------------------
describe('haversineMeters', () => {
  it('returns ~111195 m for (0,0) -> (0,1)', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    expect(d).toBeGreaterThanOrEqual(111194);
    expect(d).toBeLessThanOrEqual(111196);
  });

  it('returns 0 for identical points', () => {
    expect(
      haversineMeters({ lat: -33.87, lng: 151.2 }, { lat: -33.87, lng: 151.2 }),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 22 — selectMatrixProfile
// ---------------------------------------------------------------------------
describe('selectMatrixProfile', () => {
  it('returns driving-traffic for 10 coordinates', () => {
    expect(selectMatrixProfile(10)).toBe('driving-traffic');
  });
  it('returns driving for 11 coordinates', () => {
    expect(selectMatrixProfile(11)).toBe('driving');
  });
  it('returns driving for 25 coordinates', () => {
    expect(selectMatrixProfile(25)).toBe('driving');
  });
  it('returns null for 26 coordinates (caller falls back to stub)', () => {
    expect(selectMatrixProfile(26)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 16 — toWeightTenths
// ---------------------------------------------------------------------------
describe('toWeightTenths', () => {
  it('rounds weights to integer tenths', () => {
    expect(toWeightTenths({ travel: 0.3, windowWait: 0.1, baseProximity: 0 })).toEqual({
      travel: 3,
      windowWait: 1,
      baseProximity: 0,
    });
  });
  it('tolerates binary float error (0.30000000000000004 -> 3)', () => {
    expect(toWeightTenths({ travel: 0.1 + 0.2, windowWait: 0, baseProximity: 0 }).travel).toBe(3);
  });
  it('maps the default weights to tens', () => {
    expect(toWeightTenths(DEFAULT_ROUTE_WEIGHTS)).toEqual({
      travel: 10,
      windowWait: 10,
      baseProximity: 10,
    });
  });
});

// ---------------------------------------------------------------------------
// evaluateSequence
// ---------------------------------------------------------------------------
describe('evaluateSequence', () => {
  it('computes the base pass for Example 1 order A,B,C', () => {
    const inp = input(
      [stop('A', 0, OPEN, 1), stop('B', 0, OPEN, 2), stop('C', 0, OPEN, 3)],
      lineMatrix,
      0,
    );
    const e = evaluateSequence(inp, ['A', 'B', 'C']);
    expect(e.departureS).toBe(-600);
    expect(byKey(e, 'A').arrivalS).toBe(0);
    expect(byKey(e, 'B').arrivalS).toBe(3300);
    expect(byKey(e, 'C').arrivalS).toBe(6600);
    expect(e.finishS).toBe(9300);
    expect(e.totalTravelS).toBe(1800);
    expect(e.totalWaitS).toBe(0);
    expect(e.firstLegS).toBe(600);
    expect(e.costTenths).toBe(24000); // displayed cost 2400
    expect(e.feasible).toBe(true);
  });

  // Test 6c — forward slack removes phantom wait
  it('applies forward slack so no phantom wait remains (6c)', () => {
    const m = [
      [0, 600, 9999],
      [600, 0, 600],
      [9999, 600, 0],
    ];
    const inp = input([stop('A', 0, OPEN, 1), stop('B', 7200, 10800, 2)], m, 0);
    const e = evaluateSequence(inp, ['A', 'B']);
    expect(e.departureS).toBe(3300); // 08:55
    expect(byKey(e, 'A').arrivalS).toBe(3900); // 09:05
    expect(byKey(e, 'B').arrivalS).toBe(7200);
    expect(byKey(e, 'B').waitS).toBe(0);
    expect(e.totalWaitS).toBe(0);
    expect(e.finishS).toBe(9900);
  });

  it('forward slack never increases lateness: early-closing window keeps unavoidable wait (6c)', () => {
    const m = [
      [0, 600, 9999],
      [600, 0, 600],
      [9999, 600, 0],
    ];
    const inp = input([stop('A', 0, 1800, 1), stop('B', 7200, 10800, 2)], m, 0);
    const e = evaluateSequence(inp, ['A', 'B']);
    expect(e.departureS).toBe(1200);
    expect(byKey(e, 'A').arrivalS).toBe(1800);
    expect(byKey(e, 'B').waitS).toBe(2100);
    expect(e.totalWaitS).toBe(2100);
  });

  // Test 14 — earliestDepartureS (today's plan)
  it('honours earliestDepartureS as a departure floor (14)', () => {
    const inp = input(
      [stop('A', 0, OPEN, 1), stop('B', 0, OPEN, 2), stop('C', 0, OPEN, 3)],
      lineMatrix,
      0,
      { earliestDepartureS: 1800 },
    );
    const e = evaluateSequence(inp, ['A', 'B', 'C']);
    expect(e.departureS).toBe(1800);
    expect(byKey(e, 'A').arrivalS).toBe(2400);
    expect(byKey(e, 'A').waitS).toBe(0);
    expect(e.finishS).toBe(11700);
    expect(e.feasible).toBe(true);
  });

  it('earliestDepartureS can push a tight window late (14)', () => {
    const inp = input(
      [stop('A', 0, 1800, 1), stop('B', 0, OPEN, 2), stop('C', 0, OPEN, 3)],
      lineMatrix,
      0,
      { earliestDepartureS: 1800 },
    );
    const e = evaluateSequence(inp, ['A', 'B', 'C']);
    expect(e.feasible).toBe(false);
    expect(e.violations).toEqual([{ key: 'A', lateS: 600 }]);
  });

  // Test 15 — stop without coordinate
  it('a stop with matrixIndex null consumes time only (15)', () => {
    const inp = input(
      [stop('A', 0, OPEN, 1), stop('B', 0, OPEN, null), stop('C', 0, OPEN, 3)],
      lineMatrix,
      0,
    );
    const e = evaluateSequence(inp, ['A', 'B', 'C']);
    expect(byKey(e, 'B').travelS).toBe(0);
    expect(byKey(e, 'C').travelS).toBe(1200); // travel(A,C)
    expect(e.feasible).toBe(true);
  });

  // Test 17 — legTravelS override (final Directions pass)
  it('applies legTravelS overrides per position (17)', () => {
    const inp = input(
      [stop('A', 0, OPEN, 1), stop('B', 0, OPEN, 2), stop('C', 0, OPEN, 3)],
      lineMatrix,
      0,
    );
    const e = evaluateSequence(inp, ['A', 'B', 'C'], { legTravelS: [660, 540, 600] });
    expect(e.departureS).toBe(-660);
    expect(byKey(e, 'A').arrivalS).toBe(0);
    expect(byKey(e, 'B').arrivalS).toBe(3240);
    expect(byKey(e, 'C').arrivalS).toBe(6540);
    expect(e.finishS).toBe(9240);
    expect(e.totalTravelS).toBe(1800);
  });

  // Test 19 — order mismatch
  it('throws RouteOrderMismatchError on a bad order (19)', () => {
    const inp = input([stop('A', 0, OPEN, 1), stop('B', 0, OPEN, 2)], lineMatrix, 0);
    expect(() => evaluateSequence(inp, ['A', 'A'])).toThrow(RouteOrderMismatchError);
    expect(() => evaluateSequence(inp, ['A'])).toThrow(RouteOrderMismatchError);
    expect(() => evaluateSequence(inp, ['A', 'Z'])).toThrow(RouteOrderMismatchError);
    try {
      evaluateSequence(inp, ['A', 'Z']);
    } catch (err) {
      expect((err as RouteOrderMismatchError).code).toBe('ROUTE_ORDER_MISMATCH');
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers for optimizeRoute tests
// ---------------------------------------------------------------------------

/** Canonical rank: stops sorted by (windowStartS asc, key asc). */
function rankOf(inp: OptimizerInput): Map<string, number> {
  const canonical = [...inp.stops].sort(
    (a, b) => a.windowStartS - b.windowStartS || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  return new Map(canonical.map((s, i) => [s.key, i]));
}

/** Deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng: () => number, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([items[i], ...p]);
  }
  return out;
}

/** Random symmetric instance with origin at index 0 and stops at 1..n. */
function randomInstance(rng: () => number, n: number): OptimizerInput {
  const size = n + 1;
  const matrix: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let i = 0; i < size; i += 1) {
    for (let j = i + 1; j < size; j += 1) {
      const v = randInt(rng, 0, 3600);
      matrix[i][j] = v;
      matrix[j][i] = v;
    }
  }
  const stops: OptimizerStop[] = [];
  for (let i = 1; i <= n; i += 1) {
    const ws = randInt(rng, 0, 20000);
    const we = ws + randInt(rng, 0, 20000);
    stops.push(stop(`S${i}`, ws, we, i, randInt(rng, 600, 3600)));
  }
  return input(stops, matrix, 0);
}

// ---------------------------------------------------------------------------
// optimizeRoute — worked examples
// ---------------------------------------------------------------------------
describe('optimizeRoute — line matrix examples', () => {
  const abc = () => [stop('A', 0, OPEN, 1), stop('B', 0, OPEN, 2), stop('C', 0, OPEN, 3)];

  it('Example 1 — closest-to-base first', () => {
    const r = optimizeRoute(input(abc(), lineMatrix, 0));
    expect(r.order).toEqual(['A', 'B', 'C']);
    expect(r.method).toBe('EXACT');
    expect(r.departureS).toBe(-600);
    expect(r.costTenths).toBe(24000); // cost 2400
    expect(r.feasible).toBe(true);
    expect(r.finishS).toBe(9300);
    expect(r.totalTravelS).toBe(1800);
    expect(r.totalWaitS).toBe(0);
    expect(r.firstLegS).toBe(600);
  });

  it('Example 2 — early CONFIRMED window goes first', () => {
    const r = optimizeRoute(
      input([stop('A', 0, OPEN, 1), stop('B', 0, OPEN, 2), stop('C', 0, 1800, 3)], lineMatrix, 0),
    );
    expect(r.order).toEqual(['C', 'B', 'A']);
    expect(r.departureS).toBe(-1800);
    expect(r.costTenths).toBe(48000); // cost 4800
  });

  it('Example 3 — neither nearest nor earliest window (Finding 1)', () => {
    const r = optimizeRoute(
      input([stop('A', 0, OPEN, 1), stop('B', 0, OPEN, 2), stop('C', 0, 3600, 3)], lineMatrix, 0),
    );
    expect(r.order).toEqual(['B', 'C', 'A']);
    expect(r.departureS).toBe(-1200);
    expect(r.costTenths).toBe(42000); // cost 4200
    expect(r.firstLegS).toBe(1200);
  });

  it('Example 4 — no base (D7)', () => {
    const m = [
      [0, 600, 1200],
      [600, 0, 600],
      [1200, 600, 0],
    ]; // A=0, B=1, C=2
    const r = optimizeRoute(
      input([stop('A', 3600, 10800, 0), stop('B', 0, 7200, 1), stop('C', 0, OPEN, 2)], m, null),
    );
    expect(r.order).toEqual(['C', 'B', 'A']);
    expect(r.departureS).toBeNull();
    expect(r.finishS).toBe(9300);
    expect(r.totalTravelS).toBe(1200);
    expect(r.costTenths).toBe(12000); // cost 1200
  });

  it('Example 5 — infeasible returns least-late, lexicographic tie-break', () => {
    const m = [
      [0, 600, 600],
      [600, 0, 600],
      [600, 600, 0],
    ]; // O=0, A=1, B=2
    const r = optimizeRoute(input([stop('A', 0, 1800, 1), stop('B', 0, 1800, 2)], m, 0));
    expect(r.order).toEqual(['A', 'B']);
    expect(r.feasible).toBe(false);
    expect(r.violations).toEqual([{ key: 'B', lateS: 1500 }]);
    expect(r.totalLateS).toBe(1500);
    expect(r.costTenths).toBe(18000); // cost 1800
  });

  it('Example 6 — wait weight changes the order, with forward slack', () => {
    const m = [
      [0, 600, 1200, 2400],
      [600, 0, 600, 1800],
      [1200, 600, 0, 1800],
      [2400, 1800, 1800, 0],
    ]; // O,A,B,C
    const stops = () => [stop('A', 0, 1800, 1), stop('B', 7200, 9000, 2), stop('C', 0, OPEN, 3)];

    const def = optimizeRoute(input(stops(), m, 0));
    expect(def.order).toEqual(['A', 'C', 'B']);
    expect(def.costTenths).toBe(48000); // cost 4800

    const noWait = optimizeRoute(
      input(stops(), m, 0, { weights: { travel: 1, windowWait: 0, baseProximity: 1 } }),
    );
    expect(noWait.order).toEqual(['A', 'B', 'C']);
    expect(noWait.costTenths).toBe(36000); // cost 3600
    expect(noWait.totalWaitS).toBe(2100);
    expect(noWait.finishS).toBe(14400);
  });

  it('Example 6b — base weight changes the order', () => {
    const stops = () => [stop('A', 0, OPEN, 1), stop('B', 0, OPEN, 2), stop('C', 0, 3600, 3)];
    const noBase = optimizeRoute(
      input(stops(), lineMatrix, 0, { weights: { travel: 1, windowWait: 1, baseProximity: 0 } }),
    );
    expect(noBase.order).toEqual(['C', 'B', 'A']);
    expect(noBase.costTenths).toBe(30000); // cost 3000
    expect(noBase.finishS).toBe(9300);
  });

  it('Example 11b — service groups do not constrain the order (L-F04-11)', () => {
    // A, C "in group G1", B "in group G2" — no group field exists; same as Example 1.
    const r = optimizeRoute(input(abc(), lineMatrix, 0));
    expect(r.order).toEqual(['A', 'B', 'C']);
    expect(r.costTenths).toBe(24000); // cost 2400
  });
});

describe('optimizeRoute — heuristic', () => {
  it('Example 7 — 10 stops use the heuristic', () => {
    const size = 11;
    const m = Array.from({ length: size }, (_, i) =>
      Array.from({ length: size }, (_, j) => 300 * Math.abs(i - j)),
    );
    const stops = Array.from({ length: 10 }, (_, k) =>
      stop(`S${String(k + 1).padStart(2, '0')}`, 0, OPEN, k + 1, 1800),
    );
    const r = optimizeRoute(input(stops, m, 0));
    expect(r.method).toBe('HEURISTIC');
    expect(r.order).toEqual(stops.map((s) => s.key));
    expect(r.finishS).toBe(20700);
    expect(r.totalTravelS).toBe(3000);
    expect(r.costTenths).toBe(33000); // cost 3300
  });

  it('Example 8 — 2-opt corrects the greedy construction', () => {
    const m = [
      [0, 600, 900, 2400],
      [600, 0, 1500, 1800],
      [900, 1500, 0, 3300],
      [2400, 1800, 3300, 0],
    ]; // O, P1, P2, P3
    const stops = [stop('P1', 0, OPEN, 1, 1800), stop('P2', 0, OPEN, 2, 1800), stop('P3', 0, OPEN, 3, 1800)];
    const inp = input(stops, m, 0);
    expect(greedyConstructOrder(inp)).toEqual(['P1', 'P2', 'P3']);
    const r = optimizeRoute(inp, { forceMethod: 'HEURISTIC' });
    expect(r.order).toEqual(['P2', 'P1', 'P3']);
    expect(r.costTenths).toBe(51000); // cost 5100
  });
});

describe('optimizeRoute — method selection & determinism', () => {
  const manyStops = (n: number) =>
    Array.from({ length: n }, (_, k) => stop(`S${String(k + 1).padStart(2, '0')}`, 0, OPEN, k + 1, 600));
  const identityish = (n: number) =>
    Array.from({ length: n + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === j ? 0 : 300)),
    );

  it('8 stops → EXACT, 9 stops → HEURISTIC', () => {
    expect(optimizeRoute(input(manyStops(8), identityish(8), 0)).method).toBe('EXACT');
    expect(optimizeRoute(input(manyStops(9), identityish(9), 0)).method).toBe('HEURISTIC');
  });

  it('0 and 1 stop → TRIVIAL', () => {
    const empty = optimizeRoute(input([], [[0]], 0));
    expect(empty.method).toBe('TRIVIAL');
    expect(empty.order).toEqual([]);
    expect(empty.departureS).toBeNull();
    expect(empty.finishS).toBeNull();
    expect(empty.costTenths).toBe(0);
    expect(empty.feasible).toBe(true);

    const oneWithBase = optimizeRoute(input([stop('A', 0, OPEN, 1)], lineMatrix, 0));
    expect(oneWithBase.method).toBe('TRIVIAL');
    expect(oneWithBase.departureS).toBe(-600); // windowStart − travel

    const oneNoBase = optimizeRoute(input([stop('A', 1200, OPEN, 0)], [[0]], null));
    expect(oneNoBase.method).toBe('TRIVIAL');
    expect(byKey(oneNoBase, 'A').arrivalS).toBe(1200); // windowStart
    expect(oneNoBase.departureS).toBeNull();
  });

  it('is deterministic across shuffled inputs and reruns (12)', () => {
    const base = [stop('A', 0, OPEN, 1), stop('B', 0, OPEN, 2), stop('C', 0, OPEN, 3)];
    const shuffles = [
      [0, 1, 2],
      [2, 1, 0],
      [1, 0, 2],
      [2, 0, 1],
      [0, 2, 1],
    ];
    const results = shuffles.map((perm) =>
      optimizeRoute(input(perm.map((i) => base[i]), lineMatrix, 0)),
    );
    for (const r of results) expect(r).toEqual(results[0]);
    expect(optimizeRoute(input(base, lineMatrix, 0))).toEqual(results[0]);
  });
});

describe('optimizeRoute — proofs over seeded instances', () => {
  it('EXACT equals brute force over 50 seeded 6-stop instances (10)', () => {
    const rng = mulberry32(0xc0ffee);
    for (let t = 0; t < 50; t += 1) {
      const inp = randomInstance(rng, 6);
      const rank = rankOf(inp);
      const result = optimizeRoute(inp);
      expect(result.method).toBe('EXACT');
      let bruteMin: SequenceEvaluation | null = null;
      for (const perm of permutations(inp.stops.map((s) => s.key))) {
        const ev = evaluateSequence(inp, perm);
        if (!bruteMin || compareEvaluations(ev, bruteMin, rank) < 0) bruteMin = ev;
      }
      expect(compareEvaluations(result, bruteMin!, rank)).toBe(0);
    }
  });

  it('HEURISTIC is never worse than greedy over 50 seeded 9–12-stop instances (11)', () => {
    const rng = mulberry32(0x1234abcd);
    for (let t = 0; t < 50; t += 1) {
      const inp = randomInstance(rng, randInt(rng, 9, 12));
      const rank = rankOf(inp);
      const greedy = evaluateSequence(inp, greedyConstructOrder(inp));
      const heuristic = optimizeRoute(inp, { forceMethod: 'HEURISTIC' });
      expect(compareEvaluations(heuristic, greedy, rank)).toBeLessThanOrEqual(0);
    }
  });
});

describe('optimizeRoute — performance (20)', () => {
  it('24 stops (heuristic) < 200 ms and 8 stops (exact) < 300 ms', () => {
    const rng = mulberry32(0x5eed);

    const big = randomInstance(rng, 24);
    let s = performance.now();
    optimizeRoute(big);
    expect(performance.now() - s).toBeLessThan(200);

    const small = randomInstance(rng, 8);
    s = performance.now();
    const r = optimizeRoute(small);
    expect(r.method).toBe('EXACT');
    expect(performance.now() - s).toBeLessThan(300);
  });
});

// ---------------------------------------------------------------------------
// insertIntoOrder — Test 18
// ---------------------------------------------------------------------------
describe('insertIntoOrder', () => {
  const abc = () => [stop('A', 0, OPEN, 1), stop('B', 0, OPEN, 2), stop('C', 0, OPEN, 3)];

  it('cheapest insertion, earliest position on ties (18)', () => {
    // base [B, A], insert C → C,B,A 4800 | B,C,A 4200 | B,A,C 4200;
    // tie between B,C,A and B,A,C → earliest position → B,C,A.
    const r = insertIntoOrder(input(abc(), lineMatrix, 0), ['B', 'A'], ['C']);
    expect(r.order).toEqual(['B', 'C', 'A']);
    expect(r.method).toBe('INSERTION');
    expect(r.costTenths).toBe(42000); // cost 4200
  });

  it('keeps the manual order with method FIXED when nothing is new', () => {
    const r = insertIntoOrder(input(abc(), lineMatrix, 0), ['B', 'A', 'C'], []);
    expect(r.order).toEqual(['B', 'A', 'C']);
    expect(r.method).toBe('FIXED');
  });
});
