/**
 * Real-database tests for service-region matching in the marketplace, covering
 * GLOBAL regions (`tenant_id IS NULL`) and full CROSS-TENANT matching.
 *
 * Requires Docker (testcontainers) + PostGIS extension (provided by the
 * `postgis/postgis:16-3.4-alpine` image used in the DB harness).
 *
 * Run via: `pnpm --filter backend test:integration:db`
 *
 * Behavior: region ownership (`service_regions.tenant_id`) is NOT a matching
 * filter. Any ACTIVE region whose polygon contains an appointment's property
 * matches it — whether the region is global (`tenant_id IS NULL`) or owned by a
 * different agency. The selector (`resolveRegionsForAppointments`) and the three
 * marketplace offer queries all join regions by geometry + status only.
 *
 * The invariant that MUST hold: client/tenant isolation is enforced by the
 * per-appointment inspector→client denylist (`inspectorBlockedClients`), not by
 * region ownership. The denylist tests below pin that boundary.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import {
  seedTenant,
  seedInspector,
  seedServiceRegion,
  SYDNEY_POLYGON_GEOJSON,
  POINT_INSIDE_SYDNEY,
} from '../service-region/helpers/service-region-fixtures';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { PrismaServiceRegionRepository } from '../../../src/modules/service-region/infrastructure/prisma-service-region.repository';

let harness: DbHarness;
let repo: PrismaServiceGroupRepository;
let regionRepo: PrismaServiceRegionRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaServiceGroupRepository(harness.prisma);
  regionRepo = new PrismaServiceRegionRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  // FK-safe full reset for the marketplace scenario (the shared
  // resetServiceRegionTables helper does not cover group/appointment/property).
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE appointments, service_groups, properties, service_types, inspector_regions, service_regions, inspectors, users, branches, tenants CASCADE`,
  );
});

const PAGINATION = { page: 1, pageSize: 20, sortOrder: 'asc' as const };
const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function seedServiceType(prisma: PrismaClient): Promise<string> {
  const suffix = rand();
  const st = await prisma.serviceType.create({
    data: {
      code: `ST-${suffix}`,
      name: `Routine ${suffix}`,
      flow_type: 'ROUTINE',
      requires_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  return st.id;
}

/** Insert a GLOBAL service region (tenant_id NULL) with a real PostGIS polygon. */
async function seedGlobalRegion(
  prisma: PrismaClient,
  name: string,
  geojson: Record<string, unknown> = SYDNEY_POLYGON_GEOJSON as unknown as Record<string, unknown>,
): Promise<string> {
  const regionId = crypto.randomUUID();
  const geojsonStr = JSON.stringify(geojson);
  await prisma.$executeRaw`
    INSERT INTO service_regions (id, tenant_id, name, geom, geojson, color, status, created_at, updated_at)
    VALUES (
      ${regionId},
      NULL,
      ${name},
      ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326),
      ${geojsonStr}::jsonb,
      '#3b82f6',
      'ACTIVE'::"RegionStatus",
      NOW(),
      NOW()
    )
  `;
  return regionId;
}

async function getBranchId(prisma: PrismaClient, tenantId: string): Promise<string> {
  const branch = await prisma.branch.findFirst({ where: { tenant_id: tenantId } });
  if (!branch) throw new Error('Branch not found for tenant');
  return branch.id;
}

/** Property with coordinates inside the Sydney polygon. */
async function seedPropertyInsideSydney(
  prisma: PrismaClient,
  tenantId: string,
  branchId: string,
): Promise<string> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO properties (id, tenant_id, branch_id, property_code, type, street, suburb, postcode, state, country, geocoding_status, coordinates, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      ${tenantId},
      ${branchId},
      ${'P-' + rand()},
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
  return rows[0].id;
}

async function seedPublishedGroup(
  prisma: PrismaClient,
  serviceTypeId: string,
  createdByUserId: string,
  groupSize: number,
): Promise<string> {
  const group = await prisma.serviceGroup.create({
    data: {
      service_type_id: serviceTypeId,
      status: 'PUBLISHED',
      group_size: groupSize,
      scheduled_date: FUTURE_DATE,
      time_window: '08:00-12:00',
      priority_mode: 'STANDARD',
      published_at: new Date(),
      created_by_user_id: createdByUserId,
    },
  });
  return group.id;
}

async function seedAwaitingAppointment(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    branchId: string;
    propertyId: string;
    serviceTypeId: string;
    createdByUserId: string;
    groupId: string;
  },
): Promise<void> {
  await prisma.appointment.create({
    data: {
      tenant_id: params.tenantId,
      branch_id: params.branchId,
      property_id: params.propertyId,
      service_type_id: params.serviceTypeId,
      status: 'AWAITING_INSPECTOR',
      scheduled_date: FUTURE_DATE,
      time_slot: 'MORNING',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      tenant_confirmation_status: 'PENDING',
      created_by_user_id: params.createdByUserId,
      service_group_id: params.groupId,
    },
  });
}

async function linkInspectorRegion(
  prisma: PrismaClient,
  inspectorId: string,
  regionId: string,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO inspector_regions (inspector_id, region_id, assigned_at)
    VALUES (${inspectorId}, ${regionId}, NOW())
  `;
}

describe('marketplace — GLOBAL service regions (tenant_id IS NULL)', () => {
  it('surfaces an offer backed by a global region to a linked inspector', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const regionId = await seedGlobalRegion(harness.prisma, 'Global Sydney');
    const { inspectorId } = await seedInspector(harness.prisma, 'Insp One');
    await linkInspectorRegion(harness.prisma, inspectorId, regionId);

    const propertyId = await seedPropertyInsideSydney(harness.prisma, tenantId, branchId);
    const groupId = await seedPublishedGroup(harness.prisma, serviceTypeId, userId, 1);
    await seedAwaitingAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId,
    });

    const offers = await repo.findPublishedForInspector(inspectorId, [serviceTypeId], [], PAGINATION);
    const count = await repo.countPublishedForInspector(inspectorId, [serviceTypeId], []);
    const detail = await repo.findPublishedOfferDetail(groupId, inspectorId, [serviceTypeId], []);

    expect(count).toBe(1);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.groupId).toBe(groupId);
    expect(detail).not.toBeNull();
  });

  it('hides a global-region offer when an appointment tenant is in the inspector denylist', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency Blocked');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const regionId = await seedGlobalRegion(harness.prisma, 'Global Sydney');
    const { inspectorId } = await seedInspector(harness.prisma, 'Insp Two');
    await linkInspectorRegion(harness.prisma, inspectorId, regionId);

    const propertyId = await seedPropertyInsideSydney(harness.prisma, tenantId, branchId);
    const groupId = await seedPublishedGroup(harness.prisma, serviceTypeId, userId, 1);
    await seedAwaitingAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId,
      serviceTypeId,
      createdByUserId: userId,
      groupId,
    });

    // Denylist contains this tenant → the per-appointment gate hides the offer.
    const offers = await repo.findPublishedForInspector(inspectorId, [serviceTypeId], [tenantId], PAGINATION);
    const count = await repo.countPublishedForInspector(inspectorId, [serviceTypeId], [tenantId]);
    const detail = await repo.findPublishedOfferDetail(groupId, inspectorId, [serviceTypeId], [tenantId]);

    expect(count).toBe(0);
    expect(offers).toHaveLength(0);
    expect(detail).toBeNull();
  });

  it('cross-tenant: a tenant-scoped region matches another tenant appointment (region ownership is not a matching filter)', async () => {
    // Region OWNED by Agency A; appointment belongs to Agency B, whose property
    // sits inside A's polygon, with the inspector linked to A's region. Under
    // full cross-tenant matching this surfaces — region tenant_id is ownership
    // only. Client isolation is enforced by the denylist (asserted next).
    const { tenantId: tenantA, userId: userA } = await seedTenant(harness.prisma, 'Agency A');
    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency B');
    const branchB = await getBranchId(harness.prisma, tenantB);
    const serviceTypeId = await seedServiceType(harness.prisma);

    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId: tenantA,
      userId: userA,
      name: 'A-owned Sydney',
      geojson: SYDNEY_POLYGON_GEOJSON as unknown as Record<string, unknown>,
    });
    const { inspectorId } = await seedInspector(harness.prisma, 'Insp Three');
    await linkInspectorRegion(harness.prisma, inspectorId, regionId);

    const propertyId = await seedPropertyInsideSydney(harness.prisma, tenantB, branchB);
    const groupId = await seedPublishedGroup(harness.prisma, serviceTypeId, userB, 1);
    await seedAwaitingAppointment(harness.prisma, {
      tenantId: tenantB,
      branchId: branchB,
      propertyId,
      serviceTypeId,
      createdByUserId: userB,
      groupId,
    });

    const count = await repo.countPublishedForInspector(inspectorId, [serviceTypeId], []);
    const offers = await repo.findPublishedForInspector(inspectorId, [serviceTypeId], [], PAGINATION);
    const detail = await repo.findPublishedOfferDetail(groupId, inspectorId, [serviceTypeId], []);

    expect(count).toBe(1);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.groupId).toBe(groupId);
    expect(detail).not.toBeNull();
  });

  it('cross-tenant isolation is still enforced by the denylist (not by region ownership)', async () => {
    // Same cross-tenant setup, but the inspector is blocked from the
    // appointment's tenant → the per-appointment denylist hides the offer.
    const { tenantId: tenantA, userId: userA } = await seedTenant(harness.prisma, 'Agency A');
    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency B');
    const branchB = await getBranchId(harness.prisma, tenantB);
    const serviceTypeId = await seedServiceType(harness.prisma);

    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId: tenantA,
      userId: userA,
      name: 'A-owned Sydney',
      geojson: SYDNEY_POLYGON_GEOJSON as unknown as Record<string, unknown>,
    });
    const { inspectorId } = await seedInspector(harness.prisma, 'Insp Three Blocked');
    await linkInspectorRegion(harness.prisma, inspectorId, regionId);

    const propertyId = await seedPropertyInsideSydney(harness.prisma, tenantB, branchB);
    const groupId = await seedPublishedGroup(harness.prisma, serviceTypeId, userB, 1);
    await seedAwaitingAppointment(harness.prisma, {
      tenantId: tenantB,
      branchId: branchB,
      propertyId,
      serviceTypeId,
      createdByUserId: userB,
      groupId,
    });

    const count = await repo.countPublishedForInspector(inspectorId, [serviceTypeId], [tenantB]);
    const detail = await repo.findPublishedOfferDetail(groupId, inspectorId, [serviceTypeId], [tenantB]);

    expect(count).toBe(0);
    expect(detail).toBeNull();
  });

  it('cross-agency group via a global region: visible by default, hidden if any member tenant is blocked', async () => {
    const { tenantId: tenantA, userId: userA } = await seedTenant(harness.prisma, 'Agency A');
    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency B');
    const branchA = await getBranchId(harness.prisma, tenantA);
    const branchB = await getBranchId(harness.prisma, tenantB);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const regionId = await seedGlobalRegion(harness.prisma, 'Global Sydney');
    const { inspectorId } = await seedInspector(harness.prisma, 'Insp Four');
    await linkInspectorRegion(harness.prisma, inspectorId, regionId);

    const groupId = await seedPublishedGroup(harness.prisma, serviceTypeId, userA, 2);
    const propertyA = await seedPropertyInsideSydney(harness.prisma, tenantA, branchA);
    const propertyB = await seedPropertyInsideSydney(harness.prisma, tenantB, branchB);
    await seedAwaitingAppointment(harness.prisma, {
      tenantId: tenantA,
      branchId: branchA,
      propertyId: propertyA,
      serviceTypeId,
      createdByUserId: userA,
      groupId,
    });
    await seedAwaitingAppointment(harness.prisma, {
      tenantId: tenantB,
      branchId: branchB,
      propertyId: propertyB,
      serviceTypeId,
      createdByUserId: userB,
      groupId,
    });

    const visible = await repo.countPublishedForInspector(inspectorId, [serviceTypeId], []);
    expect(visible).toBe(1);

    const hidden = await repo.countPublishedForInspector(inspectorId, [serviceTypeId], [tenantB]);
    expect(hidden).toBe(0);
  });
});

describe('operator region resolution — GLOBAL regions', () => {
  it('resolveRegionsForAppointments returns a global region for a tenant appointment', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    await seedGlobalRegion(harness.prisma, 'Global Sydney');

    const propertyId = await seedPropertyInsideSydney(harness.prisma, tenantId, branchId);
    const appointment = await harness.prisma.appointment.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId,
        property_id: propertyId,
        service_type_id: serviceTypeId,
        status: 'DRAFT',
        scheduled_date: FUTURE_DATE,
        time_slot: 'MORNING',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        tenant_confirmation_status: 'PENDING',
        created_by_user_id: userId,
      },
    });

    const resolved = await regionRepo.resolveRegionsForAppointments([appointment.id]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.regionName).toBe('Global Sydney');
    expect(resolved[0]!.matchedAppointmentIds).toContain(appointment.id);
  });

  it('returns a region owned by ANOTHER tenant for a cross-tenant appointment (the INS-0031 repro)', async () => {
    const { tenantId: tenantA, userId: userA } = await seedTenant(harness.prisma, 'Agency A (region owner)');
    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency B (appointment)');
    const branchB = await getBranchId(harness.prisma, tenantB);
    const serviceTypeId = await seedServiceType(harness.prisma);

    // Region OWNED by Agency A; the appointment below belongs to Agency B.
    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId: tenantA,
      userId: userA,
      name: 'A-owned Sydney',
      geojson: SYDNEY_POLYGON_GEOJSON as unknown as Record<string, unknown>,
    });

    const propertyId = await seedPropertyInsideSydney(harness.prisma, tenantB, branchB);
    const appointment = await harness.prisma.appointment.create({
      data: {
        tenant_id: tenantB,
        branch_id: branchB,
        property_id: propertyId,
        service_type_id: serviceTypeId,
        status: 'DRAFT',
        scheduled_date: FUTURE_DATE,
        time_slot: 'MORNING',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        tenant_confirmation_status: 'PENDING',
        created_by_user_id: userB,
      },
    });

    const resolved = await regionRepo.resolveRegionsForAppointments([appointment.id]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.regionId).toBe(regionId);
    expect(resolved[0]!.matchedAppointmentIds).toContain(appointment.id);
  });

  it('returns BOTH overlapping regions owned by different tenants', async () => {
    const { tenantId: tenantA, userId: userA } = await seedTenant(harness.prisma, 'Agency A');
    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency B');
    const branchB = await getBranchId(harness.prisma, tenantB);
    const serviceTypeId = await seedServiceType(harness.prisma);

    const { regionId: regionA } = await seedServiceRegion(harness.prisma, {
      tenantId: tenantA,
      userId: userA,
      name: 'A Sydney',
      geojson: SYDNEY_POLYGON_GEOJSON as unknown as Record<string, unknown>,
    });
    const { regionId: regionB } = await seedServiceRegion(harness.prisma, {
      tenantId: tenantB,
      userId: userB,
      name: 'B Sydney',
      geojson: SYDNEY_POLYGON_GEOJSON as unknown as Record<string, unknown>,
    });

    const propertyId = await seedPropertyInsideSydney(harness.prisma, tenantB, branchB);
    const appointment = await harness.prisma.appointment.create({
      data: {
        tenant_id: tenantB,
        branch_id: branchB,
        property_id: propertyId,
        service_type_id: serviceTypeId,
        status: 'DRAFT',
        scheduled_date: FUTURE_DATE,
        time_slot: 'MORNING',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        tenant_confirmation_status: 'PENDING',
        created_by_user_id: userB,
      },
    });

    const resolved = await regionRepo.resolveRegionsForAppointments([appointment.id]);

    expect(resolved.map((r) => r.regionId).sort()).toEqual([regionA, regionB].sort());
  });
});
