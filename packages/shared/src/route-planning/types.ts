/**
 * Pure route-optimizer domain types (no persistence, no I/O).
 *
 * This module is bundled into the PWA, so it MUST NOT import from Node and MUST
 * NOT pull in any new dependency. All time values are integer seconds (epoch in
 * the backend/PWA, relative in the Vitest fixtures).
 */

/** Route-planning weights (0–10, step 0.1). */
export interface RouteWeights {
  travel: number;
  windowWait: number;
  baseProximity: number;
}

export const DEFAULT_ROUTE_WEIGHTS: RouteWeights = {
  travel: 1,
  windowWait: 1,
  baseProximity: 1,
};

/** Above this stop count the optimizer switches from exact DFS to the heuristic. */
export const ROUTE_OPTIMIZER_EXACT_MAX_STOPS = 8;

/** Mapbox Matrix coordinate ceilings (inclusive) that pick the profile. */
export const ROUTE_MATRIX_TRAFFIC_MAX_COORDINATES = 10;
export const ROUTE_MATRIX_MAX_COORDINATES = 25;

export interface OptimizerStop {
  /** appointmentId */
  key: string;
  /** integer seconds */
  windowStartS: number;
  /** integer seconds; if < windowStartS it is treated as windowStartS */
  windowEndS: number;
  /** integer seconds ≥ 0 (service-type duration × 60) */
  serviceS: number;
  /** row/col in travelS; null = no coordinate (consumes time only) */
  matrixIndex: number | null;
}

export interface OptimizerInput {
  /** reorderable stops only */
  stops: OptimizerStop[];
  /** square matrix of integer travel seconds ≥ 0 */
  travelS: number[][];
  /** index of the origin in travelS; null = no origin (D7) */
  originIndex: number | null;
  /** today: max(now, end of executed prefix); otherwise null */
  earliestDepartureS: number | null;
  weights: RouteWeights;
}

export interface EvaluatedStop {
  key: string;
  /** 1-based position within the reorderable stops */
  sequence: number;
  arrivalS: number;
  serviceStartS: number;
  serviceEndS: number;
  travelS: number;
  waitS: number;
  lateS: number;
}

export interface SequenceEvaluation {
  order: string[];
  /** origin departure; null without origin or without stops */
  departureS: number | null;
  /** end of the last service; null without stops */
  finishS: number | null;
  stops: EvaluatedStop[];
  totalTravelS: number;
  totalWaitS: number;
  totalLateS: number;
  /** duration of the first leg out of the origin (0 without origin) */
  firstLegS: number;
  costTenths: number;
  /** totalLateS === 0 */
  feasible: boolean;
  violations: Array<{ key: string; lateS: number }>;
}

export type OptimizerMethod =
  | 'TRIVIAL'
  | 'EXACT'
  | 'HEURISTIC'
  | 'INSERTION'
  | 'FIXED';

export interface OptimizationResult extends SequenceEvaluation {
  method: OptimizerMethod;
}

/** Integer weights used by the cost function: round(weight × 10). */
export interface WeightTenths {
  travel: number;
  windowWait: number;
  baseProximity: number;
}

/** A geographic point in decimal degrees. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Thrown when an evaluated order is not exactly the input keys. */
export class RouteOrderMismatchError extends Error {
  readonly code = 'ROUTE_ORDER_MISMATCH';

  constructor(message = 'Order does not match the optimizer input keys') {
    super(message);
    this.name = 'RouteOrderMismatchError';
  }
}
