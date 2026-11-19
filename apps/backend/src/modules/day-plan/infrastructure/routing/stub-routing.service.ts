import { haversineMeters } from '@properfy/shared';
import type {
  IRoutingService,
  RoutePoint,
  RoutingLeg,
  RoutingMatrix,
} from '../../domain/routing.service';

/** Straight-line fallback used when Mapbox is unavailable, over budget, or off. */
export const STUB_ROAD_FACTOR = 1.3;
export const STUB_SPEED_MPS = 40 / 3.6; // 40 km/h in m/s

function stubDistanceM(from: RoutePoint, to: RoutePoint): number {
  return Math.round(haversineMeters(from, to) * STUB_ROAD_FACTOR);
}

function stubDurationS(distanceM: number): number {
  return Math.round(distanceM / STUB_SPEED_MPS);
}

export class StubRoutingService implements IRoutingService {
  async matrix(points: RoutePoint[]): Promise<RoutingMatrix> {
    const n = points.length;
    const durationsS: number[][] = [];
    const distancesM: number[][] = [];
    for (let i = 0; i < n; i += 1) {
      durationsS[i] = [];
      distancesM[i] = [];
      for (let j = 0; j < n; j += 1) {
        if (i === j) {
          durationsS[i]![j] = 0;
          distancesM[i]![j] = 0;
          continue;
        }
        const dist = stubDistanceM(points[i]!, points[j]!);
        distancesM[i]![j] = dist;
        durationsS[i]![j] = stubDurationS(dist);
      }
    }
    return { provider: 'STUB', profile: 'haversine', durationsS, distancesM, nullPairs: [] };
  }

  async directions(points: RoutePoint[]): Promise<RoutingLeg> {
    const from = points[0]!;
    const to = points[points.length - 1]!;
    const distanceM = stubDistanceM(from, to);
    return {
      provider: 'STUB',
      durationS: stubDurationS(distanceM),
      distanceM,
      geometry: {
        type: 'LineString',
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      },
    };
  }
}
