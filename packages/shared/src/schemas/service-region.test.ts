import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  geojsonPolygonSchema,
  geojsonMultiPolygonSchema,
  geojsonGeometrySchema,
  createServiceRegionSchema,
  updateServiceRegionSchema,
  resolveRegionsSchema,
} from './service-region';

const SIMPLE_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [151.2, -33.87],
      [151.21, -33.87],
      [151.21, -33.86],
      [151.2, -33.87],
    ],
  ],
};

const POLYGON_WITH_HOLE = {
  type: 'Polygon' as const,
  coordinates: [
    // Exterior ring
    [
      [151.2, -33.87],
      [151.22, -33.87],
      [151.22, -33.85],
      [151.2, -33.85],
      [151.2, -33.87],
    ],
    // Interior ring (hole — e.g., a lake)
    [
      [151.205, -33.865],
      [151.215, -33.865],
      [151.215, -33.855],
      [151.205, -33.855],
      [151.205, -33.865],
    ],
  ],
};

const MULTI_POLYGON = {
  type: 'MultiPolygon' as const,
  coordinates: [
    // Polygon 1: metro area
    [
      [
        [151.2, -33.87],
        [151.21, -33.87],
        [151.21, -33.86],
        [151.2, -33.87],
      ],
    ],
    // Polygon 2: suburbs
    [
      [
        [151.3, -33.9],
        [151.35, -33.9],
        [151.35, -33.85],
        [151.3, -33.85],
        [151.3, -33.9],
      ],
    ],
  ],
};

const MULTI_POLYGON_WITH_HOLES = {
  type: 'MultiPolygon' as const,
  coordinates: [
    [
      // Exterior ring
      [
        [151.2, -33.87],
        [151.22, -33.87],
        [151.22, -33.85],
        [151.2, -33.85],
        [151.2, -33.87],
      ],
      // Hole
      [
        [151.205, -33.865],
        [151.215, -33.865],
        [151.215, -33.855],
        [151.205, -33.855],
        [151.205, -33.865],
      ],
    ],
  ],
};

describe('geojsonPolygonSchema', () => {
  it('accepts a simple polygon', () => {
    expect(geojsonPolygonSchema.safeParse(SIMPLE_POLYGON).success).toBe(true);
  });

  it('accepts a polygon with holes (interior rings)', () => {
    expect(geojsonPolygonSchema.safeParse(POLYGON_WITH_HOLE).success).toBe(true);
  });

  it('rejects a MultiPolygon', () => {
    expect(geojsonPolygonSchema.safeParse(MULTI_POLYGON).success).toBe(false);
  });

  it('rejects a ring with fewer than 4 positions', () => {
    const bad = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    expect(geojsonPolygonSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty coordinates', () => {
    expect(
      geojsonPolygonSchema.safeParse({ type: 'Polygon', coordinates: [] }).success,
    ).toBe(false);
  });
});

describe('geojsonMultiPolygonSchema', () => {
  it('accepts a valid MultiPolygon', () => {
    expect(geojsonMultiPolygonSchema.safeParse(MULTI_POLYGON).success).toBe(true);
  });

  it('accepts a MultiPolygon with holes', () => {
    expect(geojsonMultiPolygonSchema.safeParse(MULTI_POLYGON_WITH_HOLES).success).toBe(true);
  });

  it('rejects a Polygon', () => {
    expect(geojsonMultiPolygonSchema.safeParse(SIMPLE_POLYGON).success).toBe(false);
  });

  it('rejects empty coordinates array', () => {
    expect(
      geojsonMultiPolygonSchema.safeParse({ type: 'MultiPolygon', coordinates: [] }).success,
    ).toBe(false);
  });
});

describe('geojsonGeometrySchema (union)', () => {
  it('accepts a Polygon', () => {
    expect(geojsonGeometrySchema.safeParse(SIMPLE_POLYGON).success).toBe(true);
  });

  it('accepts a Polygon with holes', () => {
    expect(geojsonGeometrySchema.safeParse(POLYGON_WITH_HOLE).success).toBe(true);
  });

  it('accepts a MultiPolygon', () => {
    expect(geojsonGeometrySchema.safeParse(MULTI_POLYGON).success).toBe(true);
  });

  it('accepts a MultiPolygon with holes', () => {
    expect(geojsonGeometrySchema.safeParse(MULTI_POLYGON_WITH_HOLES).success).toBe(true);
  });

  it('rejects a Point', () => {
    const point = { type: 'Point', coordinates: [151.2, -33.87] };
    expect(geojsonGeometrySchema.safeParse(point).success).toBe(false);
  });

  it('rejects a LineString', () => {
    const line = {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    };
    expect(geojsonGeometrySchema.safeParse(line).success).toBe(false);
  });

  it('rejects a GeometryCollection', () => {
    const gc = { type: 'GeometryCollection', geometries: [] };
    expect(geojsonGeometrySchema.safeParse(gc).success).toBe(false);
  });

  it('rejects missing type', () => {
    expect(
      geojsonGeometrySchema.safeParse({ coordinates: [[]] }).success,
    ).toBe(false);
  });

  it('rejects missing coordinates', () => {
    expect(
      geojsonGeometrySchema.safeParse({ type: 'Polygon' }).success,
    ).toBe(false);
  });
});

describe('createServiceRegionSchema with geometry union', () => {
  it('accepts input with Polygon geojson', () => {
    const input = { name: 'Sydney CBD', geojson: SIMPLE_POLYGON };
    expect(createServiceRegionSchema.safeParse(input).success).toBe(true);
  });

  it('accepts input with MultiPolygon geojson', () => {
    const input = { name: 'Sydney Metro + Suburbs', geojson: MULTI_POLYGON };
    expect(createServiceRegionSchema.safeParse(input).success).toBe(true);
  });

  it('accepts input with Polygon with holes', () => {
    const input = { name: 'Region with lake exclusion', geojson: POLYGON_WITH_HOLE };
    expect(createServiceRegionSchema.safeParse(input).success).toBe(true);
  });

  it('rejects input with Point geojson', () => {
    const input = {
      name: 'Bad',
      geojson: { type: 'Point', coordinates: [0, 0] },
    };
    expect(createServiceRegionSchema.safeParse(input).success).toBe(false);
  });
});

describe('updateServiceRegionSchema with geometry union', () => {
  it('accepts update with MultiPolygon geojson', () => {
    const input = { geojson: MULTI_POLYGON };
    expect(updateServiceRegionSchema.safeParse(input).success).toBe(true);
  });

  it('accepts update without geojson', () => {
    const input = { name: 'Renamed Region' };
    expect(updateServiceRegionSchema.safeParse(input).success).toBe(true);
  });

  it('rejects update with invalid geometry type', () => {
    const input = {
      geojson: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    };
    expect(updateServiceRegionSchema.safeParse(input).success).toBe(false);
  });
});

function generateUuids(count: number): string[] {
  return Array.from({ length: count }, () => randomUUID());
}

describe('resolveRegionsSchema', () => {
  it('accepts 1 appointment ID', () => {
    const result = resolveRegionsSchema.safeParse({ appointmentIds: generateUuids(1) });
    expect(result.success).toBe(true);
  });

  it('accepts 200 appointment IDs (max)', () => {
    const result = resolveRegionsSchema.safeParse({ appointmentIds: generateUuids(200) });
    expect(result.success).toBe(true);
  });

  it('rejects 201 appointment IDs (over max)', () => {
    const result = resolveRegionsSchema.safeParse({ appointmentIds: generateUuids(201) });
    expect(result.success).toBe(false);
  });

  it('rejects empty array', () => {
    const result = resolveRegionsSchema.safeParse({ appointmentIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID strings', () => {
    const result = resolveRegionsSchema.safeParse({ appointmentIds: ['not-a-uuid'] });
    expect(result.success).toBe(false);
  });

  it('accepts optional tenantId UUID for cross-tenant callers', () => {
    const result = resolveRegionsSchema.safeParse({
      appointmentIds: generateUuids(1),
      tenantId: randomUUID(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid tenantId', () => {
    const result = resolveRegionsSchema.safeParse({
      appointmentIds: generateUuids(1),
      tenantId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});
