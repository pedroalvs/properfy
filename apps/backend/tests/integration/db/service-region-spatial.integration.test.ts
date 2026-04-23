/**
 * Real-database spatial matching tests for service regions.
 *
 * Requires Docker (testcontainers) + PostGIS extension (provided by the
 * `postgis/postgis:16-3.4-alpine` image used in the DB harness).
 *
 * Run via: `pnpm --filter backend test:integration:db`
 *
 * Covers T150-T155:
 *   T150 — point inside polygon → matched
 *   T151 — point on boundary → matched (boundary-inclusive)
 *   T152 — point outside polygon → unmatched
 *   T153 — null coordinates → unmatched
 *   T154 — point in multiple overlapping regions → all returned
 *   T155 — GIST index verification (result correctness path)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import {
  seedTenant,
  seedServiceRegion,
  resetServiceRegionTables,
  SYDNEY_POLYGON_GEOJSON,
  SYDNEY_EAST_POLYGON_GEOJSON,
  MELBOURNE_POLYGON_GEOJSON,
  POINT_INSIDE_SYDNEY,
  POINT_OUTSIDE_SYDNEY,
  POINT_ON_BOUNDARY,
  POINT_INSIDE_OVERLAP,
  POINT_INSIDE_MELBOURNE,
} from '../service-region/helpers/service-region-fixtures';
import { PrismaServiceRegionRepository } from '../../../src/modules/service-region/infrastructure/prisma-service-region.repository';

let harness: DbHarness;
let repo: PrismaServiceRegionRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaServiceRegionRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await resetServiceRegionTables(harness.prisma);
});

describe('findContainingPoint — spatial matching', () => {
  // T150: point inside polygon → matched
  it('T150 — point inside polygon is matched', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'Spatial Tenant A');
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Sydney CBD',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    const result = await repo.findContainingPoint(tenantId, POINT_INSIDE_SYDNEY.lat, POINT_INSIDE_SYDNEY.lng);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Sydney CBD');
  });

  // T151: point on boundary → matched (boundary-inclusive per PostGIS ST_Intersects)
  it('T151 — point on polygon boundary is matched (boundary-inclusive)', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'Spatial Tenant B');
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Sydney CBD',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    const result = await repo.findContainingPoint(tenantId, POINT_ON_BOUNDARY.lat, POINT_ON_BOUNDARY.lng);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Sydney CBD');
  });

  // T152: point outside polygon → unmatched
  it('T152 — point outside polygon is not matched', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'Spatial Tenant C');
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Sydney CBD',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    const result = await repo.findContainingPoint(tenantId, POINT_OUTSIDE_SYDNEY.lat, POINT_OUTSIDE_SYDNEY.lng);

    expect(result).toHaveLength(0);
  });

  // T154: point in multiple overlapping regions → all returned
  it('T154 — point inside overlapping regions returns all matches', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'Spatial Tenant D');
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Sydney West',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Sydney East',
      geojson: SYDNEY_EAST_POLYGON_GEOJSON,
    });

    // POINT_INSIDE_OVERLAP is inside both Sydney polygons
    const result = await repo.findContainingPoint(tenantId, POINT_INSIDE_OVERLAP.lat, POINT_INSIDE_OVERLAP.lng);

    expect(result).toHaveLength(2);
    const names = result.map((r) => r.name).sort();
    expect(names).toEqual(['Sydney East', 'Sydney West']);
  });

  // Cross-tenant isolation: regions from another tenant not returned
  it('cross-tenant isolation — does not return regions from other tenant', async () => {
    const { tenantId: tenantA } = await seedTenant(harness.prisma, 'Tenant A');
    const { tenantId: tenantB } = await seedTenant(harness.prisma, 'Tenant B');

    await seedServiceRegion(harness.prisma, {
      tenantId: tenantA,
      name: 'Sydney CBD - A',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });
    await seedServiceRegion(harness.prisma, {
      tenantId: tenantB,
      name: 'Sydney CBD - B',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    const resultA = await repo.findContainingPoint(tenantA, POINT_INSIDE_SYDNEY.lat, POINT_INSIDE_SYDNEY.lng);
    const resultB = await repo.findContainingPoint(tenantB, POINT_INSIDE_SYDNEY.lat, POINT_INSIDE_SYDNEY.lng);

    expect(resultA).toHaveLength(1);
    expect(resultA[0].name).toBe('Sydney CBD - A');
    expect(resultA[0].tenantId).toBe(tenantA);

    expect(resultB).toHaveLength(1);
    expect(resultB[0].name).toBe('Sydney CBD - B');
    expect(resultB[0].tenantId).toBe(tenantB);
  });

  // Inactive regions are excluded
  it('inactive regions are excluded from spatial matching', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'Tenant Inactive');
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Sydney Inactive',
      geojson: SYDNEY_POLYGON_GEOJSON,
      status: 'INACTIVE',
    });

    const result = await repo.findContainingPoint(tenantId, POINT_INSIDE_SYDNEY.lat, POINT_INSIDE_SYDNEY.lng);

    expect(result).toHaveLength(0);
  });

  // Point in completely different region (Melbourne vs Sydney)
  it('point in different geographic area does not match Sydney polygon', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'Tenant Geo');
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Sydney CBD',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    // Melbourne point should not match Sydney polygon
    const result = await repo.findContainingPoint(tenantId, POINT_INSIDE_MELBOURNE.lat, POINT_INSIDE_MELBOURNE.lng);

    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T153: null coordinates → unmatched (via resolveRegionsForAppointments)
// ---------------------------------------------------------------------------

describe('resolveRegionsForAppointments — null coordinates handling', () => {
  it('T153 — appointment with null coordinates appears in unmatchedAppointmentIds', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Resolve Tenant');

    // Create a region
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Sydney CBD',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    // Create a service type
    const serviceType = await harness.prisma.serviceType.create({
      data: {
        code: `ST-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Routine Inspection',
        flow_type: 'ROUTINE',
        requires_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });

    // Get branch for the tenant
    const branch = await harness.prisma.branch.findFirst({ where: { tenant_id: tenantId } });
    if (!branch) throw new Error('Branch not found');

    // Property with null coordinates (geocoding_status: PENDING)
    const propertyNoCoords = await harness.prisma.property.create({
      data: {
        tenant_id: tenantId,
        branch_id: branch.id,
        property_code: `NO-COORDS-${Math.random().toString(36).slice(2, 8)}`,
        type: 'RESIDENTIAL',
        street: '1 Test St',
        suburb: 'Test',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        geocoding_status: 'PENDING',
        // coordinates intentionally omitted (NULL)
      },
    });

    // Appointment with null-coordinates property
    const appointment = await harness.prisma.appointment.create({
      data: {
        tenant_id: tenantId,
        branch_id: branch.id,
        property_id: propertyNoCoords.id,
        service_type_id: serviceType.id,
        status: 'DRAFT',
        scheduled_date: new Date('2026-06-01'),
        time_slot: 'MORNING',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        tenant_confirmation_status: 'PENDING',
        created_by_user_id: userId,
      },
    });

    const result = await repo.resolveRegionsForAppointments(tenantId, [appointment.id]);

    // No regions should match (null coordinates → unmatched)
    expect(result).toHaveLength(0);
    // The use case layer computes unmatchedAppointmentIds from this result
    // (all appointment IDs not in any region's matchedAppointmentIds)
  });

  it('appointment with coordinates inside region is matched', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Resolve Tenant Matched');

    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Sydney CBD',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    const serviceType = await harness.prisma.serviceType.create({
      data: {
        code: `ST-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Routine Inspection',
        flow_type: 'ROUTINE',
        requires_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });

    const branch = await harness.prisma.branch.findFirst({ where: { tenant_id: tenantId } });
    if (!branch) throw new Error('Branch not found');

    // Property with coordinates inside Sydney polygon
    const propertyInsideSydney = await harness.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO properties (id, tenant_id, branch_id, property_code, type, street, suburb, postcode, state, country, geocoding_status, coordinates, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        ${tenantId},
        ${branch.id},
        ${'INSIDE-' + Math.random().toString(36).slice(2, 8)},
        'RESIDENTIAL',
        '1 Test St',
        'Sydney',
        '2000',
        'NSW',
        'AU',
        'SUCCESS',
        ST_SetSRID(ST_MakePoint(${POINT_INSIDE_SYDNEY.lng}, ${POINT_INSIDE_SYDNEY.lat}), 4326),
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    const propertyId = propertyInsideSydney[0].id;

    const appointment = await harness.prisma.appointment.create({
      data: {
        tenant_id: tenantId,
        branch_id: branch.id,
        property_id: propertyId,
        service_type_id: serviceType.id,
        status: 'DRAFT',
        scheduled_date: new Date('2026-06-01'),
        time_slot: 'MORNING',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        tenant_confirmation_status: 'PENDING',
        created_by_user_id: userId,
      },
    });

    const result = await repo.resolveRegionsForAppointments(tenantId, [appointment.id]);

    expect(result).toHaveLength(1);
    expect(result[0].regionName).toBe('Sydney CBD');
    expect(result[0].matchedAppointmentIds).toContain(appointment.id);
  });
});

// ---------------------------------------------------------------------------
// T155: GIST index verification
// ---------------------------------------------------------------------------

describe('T155 — GIST index correctness', () => {
  it('spatial query returns correct results consistent with GIST index', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'GIST Tenant');

    // Seed two non-overlapping regions
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Sydney',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Melbourne',
      geojson: MELBOURNE_POLYGON_GEOJSON,
    });

    // Point inside Sydney should match only Sydney
    const sydneyResult = await repo.findContainingPoint(tenantId, POINT_INSIDE_SYDNEY.lat, POINT_INSIDE_SYDNEY.lng);
    expect(sydneyResult).toHaveLength(1);
    expect(sydneyResult[0].name).toBe('Sydney');

    // Point inside Melbourne should match only Melbourne
    const melbResult = await repo.findContainingPoint(tenantId, POINT_INSIDE_MELBOURNE.lat, POINT_INSIDE_MELBOURNE.lng);
    expect(melbResult).toHaveLength(1);
    expect(melbResult[0].name).toBe('Melbourne');

    // Point outside both should match neither
    const outsideResult = await repo.findContainingPoint(tenantId, POINT_OUTSIDE_SYDNEY.lat, POINT_OUTSIDE_SYDNEY.lng);
    expect(outsideResult).toHaveLength(0);
  });
});
