import { selectMatrixProfile } from '@properfy/shared';
import { CircuitBreaker } from '../../../../shared/infrastructure/circuit-breaker';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { MetricsCollector } from '../../../../shared/infrastructure/metrics';
import type { IRoutingRateLimiter, RoutingRateBucket } from '../../domain/routing-rate-limiter';
import {
  RoutingProviderError,
  type IRoutingService,
  type MatrixProfile,
  type RoutePoint,
  type RoutingCallOptions,
  type RoutingLeg,
  type RoutingMatrix,
} from '../../domain/routing.service';

const MATRIX_TIMEOUT_MS = 8000;
const DIRECTIONS_TIMEOUT_MS = 5000;
const DEFAULT_MAX_WAIT_MS = 3000;
/** depart_at is sent only when the departure is at least this far in the future. */
const DEPART_AT_MIN_LEAD_MS = 60_000;

export interface MapboxRoutingDeps {
  rateLimiter: IRoutingRateLimiter;
  logger: Logger;
  metrics: MetricsCollector;
  /** Injected clock for the depart_at rule. */
  now?: () => Date;
}

interface MapboxMatrixBody {
  code?: string;
  durations?: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
}
interface MapboxDirectionsBody {
  code?: string;
  routes?: Array<{
    duration: number;
    distance: number;
    geometry: { type: 'LineString'; coordinates: Array<[number, number]> };
  }>;
}

/** Non-counting handled failure vs. parsed success, returned from inside the breaker. */
type CallOutcome<T> = { data: T } | { error: RoutingProviderError };

function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}
function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}
function matrixBucket(profile: MatrixProfile): RoutingRateBucket {
  return profile === 'driving-traffic' ? 'matrix:driving-traffic' : 'matrix:driving';
}

export class MapboxRoutingService implements IRoutingService {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly now: () => Date;

  constructor(
    private readonly accessToken: string,
    private readonly deps: MapboxRoutingDeps,
  ) {
    this.circuitBreaker = new CircuitBreaker({
      name: 'mapbox-routing',
      failureThreshold: 5,
      resetTimeoutMs: 60000,
    });
    this.now = deps.now ?? (() => new Date());
  }

  async matrix(points: RoutePoint[], opts?: RoutingCallOptions): Promise<RoutingMatrix> {
    const profile = selectMatrixProfile(points.length);
    if (profile === null) {
      this.record('matrix', null, points.length, 'TOO_MANY_COORDINATES');
      throw new RoutingProviderError(
        'TOO_MANY_COORDINATES',
        `Matrix supports at most 25 coordinates, received ${points.length}`,
      );
    }
    const bucket = matrixBucket(profile);
    const coords = this.coordsString(points);
    const url =
      `https://api.mapbox.com/directions-matrix/v1/mapbox/${profile}/${coords}` +
      `?annotations=duration,distance&access_token=${encodeURIComponent(this.accessToken)}`;

    const body = await this.call<MapboxMatrixBody>({
      api: 'matrix',
      profile,
      bucket,
      coordinates: points.length,
      elements: points.length * points.length,
      timeoutMs: MATRIX_TIMEOUT_MS,
      url,
      opts,
      parse: (raw) => this.parseMatrixBody(raw as MapboxMatrixBody),
    });

    const n = points.length;
    const durationsS: number[][] = [];
    const distancesM: number[][] = [];
    const nullPairs: Array<[number, number]> = [];
    for (let i = 0; i < n; i += 1) {
      durationsS[i] = [];
      distancesM[i] = [];
      for (let j = 0; j < n; j += 1) {
        const dur = body.durations?.[i]?.[j] ?? null;
        const dist = body.distances?.[i]?.[j] ?? null;
        if (dur === null || dist === null) {
          nullPairs.push([i, j]);
          durationsS[i]![j] = 0;
          distancesM[i]![j] = 0;
        } else {
          durationsS[i]![j] = Math.round(dur);
          distancesM[i]![j] = Math.round(dist);
        }
      }
    }
    return { provider: 'MAPBOX', profile, durationsS, distancesM, nullPairs };
  }

  async directions(
    points: RoutePoint[],
    opts?: RoutingCallOptions & { departAt?: Date },
  ): Promise<RoutingLeg> {
    const coords = this.coordsString(points);
    // Build the query manually so commas/semicolons stay literal for Mapbox.
    let query = 'geometries=geojson&overview=full&steps=false';
    const departAtParam = this.departAtParam(opts?.departAt);
    if (departAtParam) query += `&depart_at=${departAtParam}`;
    query += `&access_token=${encodeURIComponent(this.accessToken)}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?${query}`;

    const body = await this.call<MapboxDirectionsBody>({
      api: 'directions',
      profile: 'driving-traffic',
      bucket: 'directions',
      coordinates: points.length,
      elements: undefined,
      timeoutMs: DIRECTIONS_TIMEOUT_MS,
      url,
      opts,
      parse: (raw) => this.parseDirectionsBody(raw as MapboxDirectionsBody),
    });

    const route = body.routes![0]!;
    return {
      provider: 'MAPBOX',
      durationS: Math.round(route.duration),
      distanceM: Math.round(route.distance),
      geometry: {
        type: 'LineString',
        coordinates: route.geometry.coordinates.map(
          ([lng, lat]) => [round5(lng), round5(lat)] as [number, number],
        ),
      },
    };
  }

  private coordsString(points: RoutePoint[]): string {
    return points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  }

  /** `YYYY-MM-DDThh:mm:ssZ` with seconds zeroed, only when at least 60 s ahead. */
  private departAtParam(departAt?: Date): string | null {
    if (!departAt) return null;
    if (departAt.getTime() < this.now().getTime() + DEPART_AT_MIN_LEAD_MS) return null;
    const floored = new Date(Math.floor(departAt.getTime() / 60000) * 60000);
    return floored.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  private parseMatrixBody(raw: MapboxMatrixBody): CallOutcome<MapboxMatrixBody> {
    if (raw.code && raw.code !== 'Ok') {
      return { error: new RoutingProviderError(`PROVIDER_CODE_${raw.code}`, `Mapbox matrix returned code ${raw.code}`) };
    }
    return { data: raw };
  }

  private parseDirectionsBody(raw: MapboxDirectionsBody): CallOutcome<MapboxDirectionsBody> {
    if (raw.code && raw.code !== 'Ok') {
      return { error: new RoutingProviderError(`PROVIDER_CODE_${raw.code}`, `Mapbox directions returned code ${raw.code}`) };
    }
    if (!raw.routes || raw.routes.length === 0) {
      return { error: new RoutingProviderError('PROVIDER_CODE_NoRoute', 'Mapbox directions returned no route') };
    }
    return { data: raw };
  }

  private async call<T>(args: {
    api: 'matrix' | 'directions';
    profile: MatrixProfile;
    bucket: RoutingRateBucket;
    coordinates: number;
    elements: number | undefined;
    timeoutMs: number;
    url: string;
    opts?: RoutingCallOptions;
    parse: (raw: unknown) => CallOutcome<T>;
  }): Promise<T> {
    const { api, profile, bucket, coordinates, elements, timeoutMs, url, opts, parse } = args;
    const maxWaitMs = opts?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;

    const run = async (): Promise<CallOutcome<T>> => {
      const acquired = await this.deps.rateLimiter.acquire(bucket, maxWaitMs);
      if (!acquired) {
        return { error: new RoutingProviderError('RATE_LIMITED', `Mapbox ${api} rate budget exhausted`) };
      }
      let response: Response;
      try {
        response = await this.fetchWithTimeout(url, timeoutMs, opts?.signal);
      } catch (e) {
        if (isAbortError(e)) {
          // Counting fault: the provider was too slow.
          throw new RoutingProviderError('TIMEOUT', `Mapbox ${api} request timed out`);
        }
        throw new RoutingProviderError('NETWORK', `Mapbox ${api} request failed`);
      }
      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          await this.deps.rateLimiter.drain(bucket);
          return { error: new RoutingProviderError('HTTP_429', `Mapbox ${api} failed with status 429`) };
        }
        if (status >= 500) {
          // Counting fault: the provider is unhealthy.
          throw new RoutingProviderError(`HTTP_${status}`, `Mapbox ${api} failed with status ${status}`);
        }
        return { error: new RoutingProviderError(`HTTP_${status}`, `Mapbox ${api} failed with status ${status}`) };
      }
      const raw = (await response.json()) as unknown;
      return parse(raw);
    };

    let outcome: CallOutcome<T>;
    try {
      outcome = await this.circuitBreaker.execute(run);
    } catch (e) {
      if (e instanceof RoutingProviderError) {
        this.record(api, profile, coordinates, e.code, elements);
        throw e;
      }
      // The breaker's generic OPEN error.
      const err = new RoutingProviderError('CIRCUIT_OPEN', `Mapbox ${api} circuit open`);
      this.record(api, profile, coordinates, 'CIRCUIT_OPEN', elements);
      throw err;
    }
    if ('error' in outcome) {
      this.record(api, profile, coordinates, outcome.error.code, elements);
      throw outcome.error;
    }
    this.record(api, profile, coordinates, 'OK', elements);
    return outcome.data;
  }

  private async fetchWithTimeout(
    url: string,
    timeoutMs: number,
    externalSignal?: AbortSignal,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    if (externalSignal) externalSignal.addEventListener('abort', onExternalAbort);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  private record(
    api: 'matrix' | 'directions',
    profile: MatrixProfile | null,
    coordinates: number,
    outcome: string,
    elements?: number,
  ): void {
    const httpStatus = outcome === 'OK' ? 200 : outcome.startsWith('HTTP_') ? Number(outcome.slice(5)) : null;
    // No URL, no token — only coarse call metadata (rule: never log the token).
    this.deps.logger.info(
      { api, profile, coordinates, elements, outcome, httpStatus },
      'routing.provider_call',
    );
    this.deps.metrics.recordRoutingProviderCall({
      api,
      outcome,
      elements,
      code: outcome === 'OK' ? undefined : outcome,
    });
  }
}
