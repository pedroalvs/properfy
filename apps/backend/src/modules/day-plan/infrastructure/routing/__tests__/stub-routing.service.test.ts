import { describe, it, expect } from 'vitest';
import { haversineMeters } from '@properfy/shared';
import { StubRoutingService } from '../stub-routing.service';

const ROAD_FACTOR = 1.3;
const SPEED_MPS = 40 / 3.6;

describe('StubRoutingService', () => {
  const service = new StubRoutingService();
  const a = { lat: 0, lng: 0 };
  const b = { lat: 0, lng: 1 };
  const c = { lat: 1, lng: 1 };

  it('matrix: haversine x 1.3 duration/distance, profile haversine, provider STUB (test 41)', async () => {
    const matrix = await service.matrix([a, b, c]);

    expect(matrix.provider).toBe('STUB');
    expect(matrix.profile).toBe('haversine');
    expect(matrix.nullPairs).toEqual([]);

    // Diagonal is zero, matrix is symmetric.
    expect(matrix.durationsS[0]![0]).toBe(0);
    expect(matrix.distancesM[0]![0]).toBe(0);
    expect(matrix.durationsS[0]![1]).toBe(matrix.durationsS[1]![0]);
    expect(matrix.distancesM[1]![2]).toBe(matrix.distancesM[2]![1]);

    // Formula: round(haversine x 1.3) metres, round(that / speed) seconds.
    const h = haversineMeters(a, b);
    expect(matrix.distancesM[0]![1]).toBe(Math.round(h * ROAD_FACTOR));
    expect(matrix.durationsS[0]![1]).toBe(Math.round((h * ROAD_FACTOR) / SPEED_MPS));

    // Concrete sanity for (0,0)->(0,1) ~ 111195 m.
    expect(matrix.distancesM[0]![1]).toBeGreaterThanOrEqual(144553);
    expect(matrix.distancesM[0]![1]).toBeLessThanOrEqual(144555);
  });

  it('directions: same duration, straight LineString [from, to] in lng,lat (test 42)', async () => {
    const leg = await service.directions([a, b]);

    expect(leg.provider).toBe('STUB');
    const h = haversineMeters(a, b);
    expect(leg.distanceM).toBe(Math.round(h * ROAD_FACTOR));
    expect(leg.durationS).toBe(Math.round((h * ROAD_FACTOR) / SPEED_MPS));
    expect(leg.geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 0], // [lng, lat] of b = (lat 0, lng 1)
      ],
    });
  });

  it('matrix of one point is a 1x1 zero matrix', async () => {
    const matrix = await service.matrix([a]);
    expect(matrix.durationsS).toEqual([[0]]);
    expect(matrix.distancesM).toEqual([[0]]);
  });
});
