/**
 * Real-database tests for the per-appointment `coordinates` and `street`
 * fields on the marketplace offer detail (`findPublishedOfferDetail`).
 *
 * These fields feed the PWA map group drill-down: each appointment inside an
 * expanded group is pinned at its property's lat/lng, and the info chip shows
 * the street address. Properties whose geocoding is pending/failed have NULL
 * lat/lng and must surface `coordinates: null` (the PWA skips those pins).
 *
 * Requires Docker (testcontainers) + PostGIS.
 * Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import {
  seedTenant,
  seedInspector,
  SYDNEY_POLYGON_GEOJSON,
  POINT_INSIDE_SYDNEY,
} from '../service-region/helpers/service-region-fixtures';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';

let harness: DbHarness;
let repo: PrismaServiceGroupRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaServiceGroupRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE appointments, service_groups, properties, service_types, inspector_regions, service_regions, inspectors, users, branches, tenants CASCADE`,
  );
});

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
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  return st.id;
}

async function seedGlobalRegion(prisma: PrismaClient, name: string): Promise<string> {
  const regionId = crypto.randomUUID();
  const geojsonStr = JSON.stringify(SYDNEY_POLYGON_GEOJSON);
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

/**
 * Property inside the Sydney polygon. `withLatLng` controls whether the plain
 * lat/lng display columns are populated (the PostGIS `coordinates` column is
 * always set so the region spatial join matches either way).
 */
async function seedPropertyInsideSydney(
  prisma: PrismaClient,
  tenantId: string,
  branchId: string,
  opts: { street: string; withLatLng: boolean },
): Promise<string> {
  const lat = opts.withLatLng ? POINT_INSIDE_SYDNEY.lat : null;
  const lng = opts.withLatLng ? POINT_INSIDE_SYDNEY.lng : null;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO properties (id, tenant_id, branch_id, property_code, type, street, suburb, postcode, state, country, geocoding_status, lat, lng, coordinates, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      ${tenantId},
      ${branchId},
      ${'P-' + rand()},
      'HOUSE',
      ${opts.street},
      'Sydney',
      '2000',
      'NSW',
      'AU',
      'SUCCESS',
      ${lat},
      ${lng},
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
      time_slot_start: '09:00', time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
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

describe('marketplace offer detail — per-appointment coordinates and street', () => {
  it('returns coordinates as plain numbers and the property street for a geocoded appointment, and coordinates null when lat/lng are missing', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency Geo');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const regionId = await seedGlobalRegion(harness.prisma, 'Global Sydney');
    const { inspectorId } = await seedInspector(harness.prisma, 'Insp Geo');
    await linkInspectorRegion(harness.prisma, inspectorId, regionId);

    const groupId = await seedPublishedGroup(harness.prisma, serviceTypeId, userId, 2);
    const geocodedProperty = await seedPropertyInsideSydney(harness.prisma, tenantId, branchId, {
      street: '10 Main St',
      withLatLng: true,
    });
    const pendingProperty = await seedPropertyInsideSydney(harness.prisma, tenantId, branchId, {
      street: '20 Beach Rd',
      withLatLng: false,
    });
    await seedAwaitingAppointment(harness.prisma, {
      tenantId, branchId, propertyId: geocodedProperty, serviceTypeId, createdByUserId: userId, groupId,
    });
    await seedAwaitingAppointment(harness.prisma, {
      tenantId, branchId, propertyId: pendingProperty, serviceTypeId, createdByUserId: userId, groupId,
    });

    const detail = await repo.findPublishedOfferDetail(groupId, inspectorId, [serviceTypeId], []);

    expect(detail).not.toBeNull();
    expect(detail!.appointments).toHaveLength(2);

    const geocoded = detail!.appointments.find((a) => a.street === '10 Main St');
    const pending = detail!.appointments.find((a) => a.street === '20 Beach Rd');

    expect(geocoded).toBeDefined();
    expect(geocoded!.coordinates).not.toBeNull();
    expect(typeof geocoded!.coordinates!.lat).toBe('number');
    expect(typeof geocoded!.coordinates!.lng).toBe('number');
    expect(geocoded!.coordinates!.lat).toBeCloseTo(POINT_INSIDE_SYDNEY.lat, 5);
    expect(geocoded!.coordinates!.lng).toBeCloseTo(POINT_INSIDE_SYDNEY.lng, 5);

    expect(pending).toBeDefined();
    expect(pending!.coordinates).toBeNull();
  });
});
