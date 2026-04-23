/**
 * Real-database tests for inspector-region assignment and INSP filtering.
 *
 * Covers:
 *   T145 — multi-tenant inspector assignment and tenant-scoped query
 *   T175 — INSP list filtering with multi-region seed
 *
 * Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import {
  seedTenant,
  seedServiceRegion,
  seedInspector,
  resetServiceRegionTables,
  SYDNEY_POLYGON_GEOJSON,
  SYDNEY_EAST_POLYGON_GEOJSON,
  MELBOURNE_POLYGON_GEOJSON,
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

const defaultPagination = { page: 1, pageSize: 20, sortOrder: 'asc' as const };

describe('T145 — inspector assignment and tenant-scoped query', () => {
  it('setInspectorRegions replaces previous assignments (full replacement semantics)', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'Assign Tenant A');
    const { inspectorId } = await seedInspector(harness.prisma, 'Inspector Alpha');

    const { regionId: r1 } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Region 1',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });
    const { regionId: r2 } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Region 2',
      geojson: SYDNEY_EAST_POLYGON_GEOJSON,
    });

    // Assign to R1 and R2
    await repo.setInspectorRegions(inspectorId, [r1, r2]);
    const afterFirst = await repo.getInspectorRegionIds(inspectorId);
    expect(afterFirst).toHaveLength(2);
    expect(afterFirst).toContain(r1);
    expect(afterFirst).toContain(r2);

    // Replace with only R1
    await repo.setInspectorRegions(inspectorId, [r1]);
    const afterSecond = await repo.getInspectorRegionIds(inspectorId);
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]).toBe(r1);
  });

  it('findAllByInspector returns only regions assigned to the inspector within tenant', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'Inspector Filter Tenant');
    const { inspectorId } = await seedInspector(harness.prisma, 'Inspector Beta');

    const { regionId: assigned1 } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Assigned Region 1',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });
    const { regionId: assigned2 } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Assigned Region 2',
      geojson: SYDNEY_EAST_POLYGON_GEOJSON,
    });
    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Unassigned Region',
      geojson: MELBOURNE_POLYGON_GEOJSON,
    });

    await repo.setInspectorRegions(inspectorId, [assigned1, assigned2]);

    const results = await repo.findAllByInspector(inspectorId, tenantId, {}, defaultPagination);

    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(['Assigned Region 1', 'Assigned Region 2']);
  });

  it('countByInspector returns correct count for inspector assignments', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'Count Inspector Tenant');
    const { inspectorId } = await seedInspector(harness.prisma, 'Inspector Gamma');

    const { regionId: r1 } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Count Region 1',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });
    const { regionId: r2 } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Count Region 2',
      geojson: SYDNEY_EAST_POLYGON_GEOJSON,
    });

    await repo.setInspectorRegions(inspectorId, [r1, r2]);

    const count = await repo.countByInspector(inspectorId, tenantId, {});
    expect(count).toBe(2);
  });

  it('T145 — tenant scope: inspector queries only return regions within the specified tenant', async () => {
    const { tenantId: tenantA } = await seedTenant(harness.prisma, 'Multi-tenant A');
    const { tenantId: tenantB } = await seedTenant(harness.prisma, 'Multi-tenant B');
    const { inspectorId } = await seedInspector(harness.prisma, 'Cross-tenant Inspector');

    const { regionId: regionA } = await seedServiceRegion(harness.prisma, {
      tenantId: tenantA,
      name: 'Tenant A Region',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });
    const { regionId: regionB } = await seedServiceRegion(harness.prisma, {
      tenantId: tenantB,
      name: 'Tenant B Region',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    // Assign inspector to regions in both tenants
    await repo.setInspectorRegions(inspectorId, [regionA, regionB]);

    // Query scoped to tenant A — should only see tenant A's region
    const resultsA = await repo.findAllByInspector(inspectorId, tenantA, {}, defaultPagination);
    expect(resultsA).toHaveLength(1);
    expect(resultsA[0].tenantId).toBe(tenantA);

    // Query scoped to tenant B — should only see tenant B's region
    const resultsB = await repo.findAllByInspector(inspectorId, tenantB, {}, defaultPagination);
    expect(resultsB).toHaveLength(1);
    expect(resultsB[0].tenantId).toBe(tenantB);
  });

  it('findAllByInspector returns empty array when inspector has no assignments', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'No Assignment Tenant');
    const { inspectorId } = await seedInspector(harness.prisma, 'Unassigned Inspector');

    await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Some Region',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    const results = await repo.findAllByInspector(inspectorId, tenantId, {}, defaultPagination);
    expect(results).toHaveLength(0);
  });
});

describe('T175 — INSP list filtering end-to-end (repository layer)', () => {
  it('inspector sees 2 of 5 regions when assigned to only 2', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'INSP Filter Tenant');
    const { inspectorId } = await seedInspector(harness.prisma, 'Filtered Inspector');

    const regions = await Promise.all([
      seedServiceRegion(harness.prisma, { tenantId, name: 'R1', geojson: SYDNEY_POLYGON_GEOJSON }),
      seedServiceRegion(harness.prisma, { tenantId, name: 'R2', geojson: SYDNEY_POLYGON_GEOJSON }),
      seedServiceRegion(harness.prisma, { tenantId, name: 'R3', geojson: SYDNEY_POLYGON_GEOJSON }),
      seedServiceRegion(harness.prisma, { tenantId, name: 'R4', geojson: SYDNEY_POLYGON_GEOJSON }),
      seedServiceRegion(harness.prisma, { tenantId, name: 'R5', geojson: SYDNEY_POLYGON_GEOJSON }),
    ]);

    // Assign only 2 of 5
    await repo.setInspectorRegions(inspectorId, [regions[0].regionId, regions[2].regionId]);

    const results = await repo.findAllByInspector(inspectorId, tenantId, {}, defaultPagination);
    const count = await repo.countByInspector(inspectorId, tenantId, {});

    expect(results).toHaveLength(2);
    expect(count).toBe(2);

    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(['R1', 'R3']);
  });
});

describe('countActiveInspectorsInRegion', () => {
  it('counts only active inspectors assigned to a region', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'Inspector Count Tenant');

    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Counting Region',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    const { inspectorId: insp1 } = await seedInspector(harness.prisma, 'Inspector One');
    const { inspectorId: insp2 } = await seedInspector(harness.prisma, 'Inspector Two');

    await repo.setInspectorRegions(insp1, [regionId]);
    await repo.setInspectorRegions(insp2, [regionId]);

    const count = await repo.countActiveInspectorsInRegion(regionId);
    expect(count).toBe(2);
  });

  it('returns 0 when no inspectors are assigned', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'Zero Inspectors Tenant');

    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId,
      name: 'Empty Region',
      geojson: SYDNEY_POLYGON_GEOJSON,
    });

    const count = await repo.countActiveInspectorsInRegion(regionId);
    expect(count).toBe(0);
  });
});
