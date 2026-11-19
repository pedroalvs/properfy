import { describe, it, expect } from 'vitest';
import { dayPlanGeometrySchema } from '@properfy/shared';
import { buildRouteFallback } from './build-route-fallback';
import { buildRouteGeometry } from './build-route-geometry';
import { makeStopRow } from './live-day-test-factories';

describe('buildRouteFallback (test 8)', () => {
  it('builds a straight line in [lng, lat] order, approximate true', () => {
    const geo = buildRouteFallback([
      { lat: -33.87, lng: 151.2 },
      { lat: -33.88, lng: 151.21 },
      { lat: -33.89, lng: 151.22 },
    ]);
    expect(geo).not.toBeNull();
    const feature = geo!.features[0]!;
    expect(feature.geometry.coordinates).toEqual([
      [151.2, -33.87],
      [151.21, -33.88],
      [151.22, -33.89],
    ]);
    expect(feature.properties).toEqual({ fromSequence: 0, toSequence: 2, approximate: true });
    expect(() => dayPlanGeometrySchema.parse(geo)).not.toThrow();
  });

  it('skips points without a coordinate', () => {
    const geo = buildRouteFallback([
      { lat: -33.87, lng: 151.2 },
      { lat: null, lng: null },
      { lat: -33.89, lng: 151.22 },
    ]);
    expect(geo!.features[0]!.geometry.coordinates).toHaveLength(2);
  });

  it('returns null with fewer than two coordinate-bearing points', () => {
    expect(buildRouteFallback([{ lat: -33.87, lng: 151.2 }])).toBeNull();
    expect(buildRouteFallback([{ lat: null, lng: null }, { lat: 1, lng: 2 }])).toBeNull();
    expect(buildRouteFallback([])).toBeNull();
  });
});

describe('buildRouteGeometry', () => {
  const stops = [
    makeStopRow({ appointmentId: 'A', sequence: 1, propertyLat: -33.88, propertyLng: 151.21 }),
    makeStopRow({ appointmentId: 'B', sequence: 2, propertyLat: -33.89, propertyLng: 151.22 }),
  ];

  it('starts at the origin when one is given', () => {
    const geo = buildRouteGeometry({ lat: -33.87, lng: 151.2 }, stops);
    expect(geo!.features[0]!.geometry.coordinates).toEqual([
      [151.2, -33.87],
      [151.21, -33.88],
      [151.22, -33.89],
    ]);
  });

  it('omits the origin vertex when there is no origin pin (LAST_STOP / none)', () => {
    const geo = buildRouteGeometry(null, stops);
    expect(geo!.features[0]!.geometry.coordinates).toEqual([
      [151.21, -33.88],
      [151.22, -33.89],
    ]);
  });

  it('a single coordinate-bearing stop with no origin -> null', () => {
    const geo = buildRouteGeometry(null, [stops[0]!]);
    expect(geo).toBeNull();
  });
});
