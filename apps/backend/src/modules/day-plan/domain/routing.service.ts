/**
 * Routing provider port (F04). Matrix decides stop order only (never final ETAs);
 * Directions computes the final per-leg ETA and geometry. The access token is
 * resolved per call by DynamicRoutingService from the Integrations Hub `mapbox`
 * config and is never read from the environment by an adapter (rule N5).
 */

export interface RoutePoint {
  lat: number;
  lng: number;
}

export type RoutingProviderName = 'MAPBOX' | 'STUB';
export type MatrixProfile = 'driving-traffic' | 'driving' | 'haversine';

export interface RoutingMatrix {
  provider: RoutingProviderName;
  profile: MatrixProfile;
  /** Pairwise durations in whole seconds. */
  durationsS: number[][];
  /** Pairwise distances in whole metres. */
  distancesM: number[][];
  /** `[i, j]` pairs the provider could not route (filled by the caller with the stub). */
  nullPairs: Array<[number, number]>;
}

export interface RoutingLeg {
  provider: RoutingProviderName;
  durationS: number;
  distanceM: number;
  /** `[lng, lat]` at 5 decimals. */
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> };
}

export interface RoutingCallOptions {
  /** Max time to wait on the shared rate limiter before giving up. */
  maxWaitMs?: number;
  signal?: AbortSignal;
}

export interface IRoutingService {
  /** Pairwise travel times, ORDERING ONLY (never final ETAs). Throws RoutingProviderError. */
  matrix(points: RoutePoint[], opts?: RoutingCallOptions): Promise<RoutingMatrix>;
  /** Fixed-order route for ONE leg (2 points) or more; departAt = departure from points[0]. */
  directions(
    points: RoutePoint[],
    opts?: RoutingCallOptions & { departAt?: Date },
  ): Promise<RoutingLeg>;
}

/**
 * The adapter's typed failures. `code` carries the HTTP status (`HTTP_429`) or the
 * provider body code (`PROVIDER_CODE_NoRoute`) WITHOUT ever embedding the token.
 */
export type RoutingProviderErrorCode =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'CIRCUIT_OPEN'
  | 'TOO_MANY_COORDINATES'
  | 'NETWORK'
  | `HTTP_${number}`
  | `PROVIDER_CODE_${string}`;

export class RoutingProviderError extends Error {
  constructor(
    readonly code: RoutingProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RoutingProviderError';
  }
}

/**
 * Thrown by PlanRouteService in strict (job) mode instead of degrading to the stub,
 * so a rate-limited or transiently-failed plan is deferred and retried, never
 * published silently wrong.
 */
export class RoutingDeferredError extends Error {
  constructor(
    readonly reason: 'RATE_LIMITED' | 'DEADLINE' | 'PROVIDER_ERROR',
    override readonly cause?: unknown,
  ) {
    super(`Routing deferred: ${reason}`);
    this.name = 'RoutingDeferredError';
  }
}
