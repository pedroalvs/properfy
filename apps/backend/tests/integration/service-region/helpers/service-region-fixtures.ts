/**
 * PostGIS-aware seed helpers for service-region integration tests.
 *
 * All geometries use SRID 4326 (WGS-84).  Polygon coordinates follow the
 * GeoJSON winding convention (counter-clockwise for exterior rings) and are
 * closed (first === last point).
 *
 * Coordinate system reminder: GeoJSON uses [longitude, latitude] order.
 * PostGIS `ST_MakePoint(lng, lat)` follows the same [lng, lat] convention.
 */

import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// GeoJSON fixtures
// ---------------------------------------------------------------------------

/**
 * A 1° × 1° square centered on Sydney (~111 km per side).
 * SW corner: [150.5, -34.0], NE corner: [151.5, -33.0].
 * Interior test point: [151.0, -33.5]  (center).
 * Exterior test point: [152.0, -33.5]  (east of polygon).
 * Boundary test point: [150.5, -33.5]  (on the western edge).
 */
export const SYDNEY_POLYGON_GEOJSON = {
  type: 'Polygon',
  coordinates: [
    [
      [150.5, -34.0],
      [151.5, -34.0],
      [151.5, -33.0],
      [150.5, -33.0],
      [150.5, -34.0],
    ],
  ],
} as const;

/**
 * A 1° × 1° square overlapping SYDNEY_POLYGON_GEOJSON.
 * SW corner: [151.0, -34.0], NE corner: [152.0, -33.0].
 * The shared interior area spans [151.0, -34.0] – [151.5, -33.0].
 */
export const SYDNEY_EAST_POLYGON_GEOJSON = {
  type: 'Polygon',
  coordinates: [
    [
      [151.0, -34.0],
      [152.0, -34.0],
      [152.0, -33.0],
      [151.0, -33.0],
      [151.0, -34.0],
    ],
  ],
} as const;

/**
 * A 1° × 1° square far from SYDNEY_POLYGON_GEOJSON (Melbourne region).
 */
export const MELBOURNE_POLYGON_GEOJSON = {
  type: 'Polygon',
  coordinates: [
    [
      [144.0, -38.5],
      [145.0, -38.5],
      [145.0, -37.5],
      [144.0, -37.5],
      [144.0, -38.5],
    ],
  ],
} as const;

// Well-known test points (lng, lat)
export const POINT_INSIDE_SYDNEY = { lng: 151.0, lat: -33.5 }; // center of Sydney polygon
export const POINT_OUTSIDE_SYDNEY = { lng: 152.0, lat: -33.5 }; // east of Sydney polygon
export const POINT_ON_BOUNDARY = { lng: 150.5, lat: -33.5 }; // western edge of Sydney polygon
export const POINT_INSIDE_OVERLAP = { lng: 151.25, lat: -33.5 }; // inside both Sydney polygons
export const POINT_INSIDE_MELBOURNE = { lng: 144.5, lat: -38.0 };

// ---------------------------------------------------------------------------
// Tenant / User seed helpers
// ---------------------------------------------------------------------------

export interface SeededTenant {
  tenantId: string;
  userId: string;
}

export async function seedTenant(
  prisma: PrismaClient,
  name: string,
): Promise<SeededTenant> {
  const tenant = await prisma.tenant.create({
    data: {
      name,
      legal_name: `${name} Pty Ltd`,
      status: 'ACTIVE',
    },
  });

  const branch = await prisma.branch.create({
    data: {
      tenant_id: tenant.id,
      name: `${name} Branch`,
      status: 'ACTIVE',
    },
  });

  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      role: 'CL_ADMIN',
      name: `${name} Admin`,
      email: `admin-${Math.random().toString(36).slice(2, 10)}@${name.toLowerCase().replace(/\s/g, '')}.test`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });

  return { tenantId: tenant.id, userId: user.id };
}

// ---------------------------------------------------------------------------
// Service region seed helpers
// ---------------------------------------------------------------------------

export interface SeededRegion {
  regionId: string;
  tenantId: string;
}

/**
 * Seeds a service region with a real PostGIS geometry populated via raw SQL
 * so that spatial queries work in tests.
 */
export async function seedServiceRegion(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    userId?: string | null;
    name: string;
    geojson?: Record<string, unknown>;
    color?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  },
): Promise<SeededRegion> {
  const regionId = crypto.randomUUID();
  const geojson = params.geojson ?? SYDNEY_POLYGON_GEOJSON;
  const geojsonStr = JSON.stringify(geojson);
  const color = params.color ?? '#3b82f6';
  const status = params.status ?? 'ACTIVE';
  const userId = params.userId ?? null;

  await prisma.$executeRaw`
    INSERT INTO service_regions (id, tenant_id, name, geom, geojson, color, status, created_by_user_id, created_at, updated_at)
    VALUES (
      ${regionId},
      ${params.tenantId},
      ${params.name},
      ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326),
      ${geojsonStr}::jsonb,
      ${color},
      ${status}::"RegionStatus",
      ${userId},
      NOW(),
      NOW()
    )
  `;

  return { regionId, tenantId: params.tenantId };
}

// ---------------------------------------------------------------------------
// Inspector seed helpers
// ---------------------------------------------------------------------------

export interface SeededInspector {
  inspectorId: string;
  userId: string;
}

export async function seedInspector(
  prisma: PrismaClient,
  name: string,
): Promise<SeededInspector> {
  const user = await prisma.user.create({
    data: {
      tenant_id: null,
      branch_id: null,
      role: 'INSP',
      name,
      email: `insp-${Math.random().toString(36).slice(2, 10)}@inspectors.test`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });

  const inspector = await prisma.inspector.create({
    data: {
      user_id: user.id,
      name,
      email: user.email,
      status: 'ACTIVE',
    },
  });

  return { inspectorId: inspector.id, userId: user.id };
}

// ---------------------------------------------------------------------------
// Reset helper
// ---------------------------------------------------------------------------

/**
 * Removes all rows from service-region-related tables in FK-safe order.
 * Use in `beforeEach` within a shared harness lifecycle.
 */
export async function resetServiceRegionTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE inspector_regions CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE service_regions CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE inspectors CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE users CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE branches CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE tenants CASCADE`);
}
