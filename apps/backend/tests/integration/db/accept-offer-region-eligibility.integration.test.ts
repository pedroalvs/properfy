/**
 * Real-database tests for region eligibility on POST /v1/marketplace/offers/:groupId/accept.
 *
 * The offer list/count/detail queries only surface a group to an inspector
 * linked (via `inspector_regions`) to an ACTIVE region whose polygon contains
 * one of the group's properties. `AcceptOfferUseCase` used to re-check service
 * type and the client denylist but NOT the region, so an inspector could accept
 * an out-of-region group by calling the API directly. These tests pin that the
 * accept path applies the same predicate as the listing.
 *
 * Requires Docker (testcontainers) + PostGIS. Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import {
  seedTenant,
  seedInspector,
  seedServiceRegion,
  SYDNEY_POLYGON_GEOJSON,
  MELBOURNE_POLYGON_GEOJSON,
  POINT_INSIDE_SYDNEY,
} from '../service-region/helpers/service-region-fixtures';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { PrismaInspectorRepository } from '../../../src/modules/inspector/infrastructure/prisma-inspector.repository';
import { AcceptOfferUseCase } from '../../../src/modules/service-group/application/use-cases/accept-offer.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';

let harness: DbHarness;

beforeAll(async () => {
  harness = await setupDbHarness();
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

async function getBranchId(prisma: PrismaClient, tenantId: string): Promise<string> {
  const branch = await prisma.branch.findFirst({ where: { tenant_id: tenantId } });
  if (!branch) throw new Error('Branch not found for tenant');
  return branch.id;
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

/** Insert a GLOBAL service region (tenant_id NULL) with a real PostGIS polygon. */
async function seedGlobalRegion(
  prisma: PrismaClient,
  name: string,
  geojson: Record<string, unknown>,
): Promise<string> {
  const regionId = crypto.randomUUID();
  const geojsonStr = JSON.stringify(geojson);
  await prisma.$executeRaw`
    INSERT INTO service_regions (id, tenant_id, name, geom, geojson, color, status, created_at, updated_at)
    VALUES (
      ${regionId}, NULL, ${name},
      ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326),
      ${geojsonStr}::jsonb, '#3b82f6', 'ACTIVE'::"RegionStatus", NOW(), NOW()
    )
  `;
  return regionId;
}

async function linkInspectorRegion(prisma: PrismaClient, inspectorId: string, regionId: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO inspector_regions (inspector_id, region_id, assigned_at)
    VALUES (${inspectorId}, ${regionId}, NOW())
  `;
}

/** A published group with one AWAITING_INSPECTOR appointment whose property sits inside Sydney. */
async function seedSydneyOffer(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  serviceTypeId: string,
): Promise<string> {
  const branchId = await getBranchId(prisma, tenantId);
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO properties (id, tenant_id, branch_id, property_code, type, street, suburb, postcode, state, country, geocoding_status, coordinates, created_at, updated_at)
    VALUES (
      gen_random_uuid(), ${tenantId}, ${branchId}, ${'P-' + rand()}, 'HOUSE', '1 Test St', 'Sydney', '2000', 'NSW', 'AU', 'SUCCESS',
      ST_SetSRID(ST_MakePoint(${POINT_INSIDE_SYDNEY.lng}, ${POINT_INSIDE_SYDNEY.lat}), 4326),
      NOW(), NOW()
    )
    RETURNING id
  `;
  const group = await prisma.serviceGroup.create({
    data: {
      service_type_id: serviceTypeId,
      status: 'PUBLISHED',
      scheduled_date: FUTURE_DATE,
      time_window: '08:00-12:00',
      published_at: new Date(),
      created_by_user_id: userId,
    },
  });
  await prisma.appointment.create({
    data: {
      tenant_id: tenantId,
      branch_id: branchId,
      property_id: rows[0]!.id,
      service_type_id: serviceTypeId,
      status: 'AWAITING_INSPECTOR',
      scheduled_date: FUTURE_DATE,
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: userId,
      service_group_id: group.id,
    },
  });
  return group.id;
}

/** Inspector certified for `serviceTypeId`, blocked from no one. */
async function seedEligibleInspector(prisma: PrismaClient, serviceTypeId: string): Promise<string> {
  const { inspectorId } = await seedInspector(prisma, `Insp ${rand()}`);
  await prisma.inspector.update({
    where: { id: inspectorId },
    data: { service_types_json: [{ serviceTypeId, certified: true }], blocked_clients_json: [] },
  });
  return inspectorId;
}

function wire(prisma: PrismaClient): AcceptOfferUseCase {
  const auditService = { log: vi.fn() } as unknown as AuditService;
  const store = new Map<string, unknown>();
  const idempotencyService = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, _scope: string, value: unknown) => {
      store.set(key, value);
    }),
  } as unknown as IIdempotencyService;
  return new AcceptOfferUseCase(
    new PrismaServiceGroupRepository(prisma),
    new PrismaInspectorRepository(prisma),
    auditService,
    idempotencyService,
    new AuthorizationService(auditService),
  );
}

function inspActor(inspectorId: string): AuthContext {
  return { userId: 'insp-user-1', tenantId: null, role: 'INSP', branchId: null, inspectorId };
}

describe('AcceptOfferUseCase — region eligibility (real DB)', () => {
  it('rejects an accept when the group has no property inside any of the inspector regions', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const serviceTypeId = await seedServiceType(harness.prisma);
    const groupId = await seedSydneyOffer(harness.prisma, tenantId, userId, serviceTypeId);

    // Inspector serves Melbourne only; the offer is in Sydney.
    const inspectorId = await seedEligibleInspector(harness.prisma, serviceTypeId);
    const melbourne = await seedGlobalRegion(
      harness.prisma,
      'Global Melbourne',
      MELBOURNE_POLYGON_GEOJSON as unknown as Record<string, unknown>,
    );
    await linkInspectorRegion(harness.prisma, inspectorId, melbourne);

    await expect(
      wire(harness.prisma).execute({ groupId, inspectorId, actor: inspActor(inspectorId) }),
    ).rejects.toMatchObject({ code: 'INSPECTOR_REGION_INELIGIBLE', statusCode: 422 });

    const group = await harness.prisma.serviceGroup.findUniqueOrThrow({ where: { id: groupId } });
    expect(group.status).toBe('PUBLISHED');
    expect(group.assigned_inspector_id).toBeNull();
    const appts = await harness.prisma.appointment.findMany({ where: { service_group_id: groupId } });
    expect(appts.map((a) => a.status)).toEqual(['AWAITING_INSPECTOR']);
  });

  it('rejects an accept from an inspector linked to no region at all', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const serviceTypeId = await seedServiceType(harness.prisma);
    const groupId = await seedSydneyOffer(harness.prisma, tenantId, userId, serviceTypeId);
    const inspectorId = await seedEligibleInspector(harness.prisma, serviceTypeId);

    await expect(
      wire(harness.prisma).execute({ groupId, inspectorId, actor: inspActor(inspectorId) }),
    ).rejects.toMatchObject({ code: 'INSPECTOR_REGION_INELIGIBLE' });
  });

  it('accepts an in-region offer backed by a GLOBAL region (tenant_id NULL)', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const serviceTypeId = await seedServiceType(harness.prisma);
    const groupId = await seedSydneyOffer(harness.prisma, tenantId, userId, serviceTypeId);
    const inspectorId = await seedEligibleInspector(harness.prisma, serviceTypeId);
    const sydney = await seedGlobalRegion(
      harness.prisma,
      'Global Sydney',
      SYDNEY_POLYGON_GEOJSON as unknown as Record<string, unknown>,
    );
    await linkInspectorRegion(harness.prisma, inspectorId, sydney);

    const result = await wire(harness.prisma).execute({ groupId, inspectorId, actor: inspActor(inspectorId) });

    expect(result).toMatchObject({ status: 'ACCEPTED', assignedInspectorId: inspectorId, appointmentsScheduled: 1 });
    const group = await harness.prisma.serviceGroup.findUniqueOrThrow({ where: { id: groupId } });
    expect(group.status).toBe('ACCEPTED');
  });

  it('accepts cross-tenant: a region owned by another agency still matches (ownership is not a filter)', async () => {
    const { tenantId: tenantA, userId: userA } = await seedTenant(harness.prisma, 'Agency A');
    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency B');
    const serviceTypeId = await seedServiceType(harness.prisma);
    const groupId = await seedSydneyOffer(harness.prisma, tenantB, userB, serviceTypeId);
    const inspectorId = await seedEligibleInspector(harness.prisma, serviceTypeId);
    const { regionId } = await seedServiceRegion(harness.prisma, {
      tenantId: tenantA,
      userId: userA,
      name: 'A-owned Sydney',
      geojson: SYDNEY_POLYGON_GEOJSON as unknown as Record<string, unknown>,
    });
    await linkInspectorRegion(harness.prisma, inspectorId, regionId);

    const result = await wire(harness.prisma).execute({ groupId, inspectorId, actor: inspActor(inspectorId) });

    expect(result.status).toBe('ACCEPTED');
  });

  it('replays an Idempotency-Key result after a successful in-region accept', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const serviceTypeId = await seedServiceType(harness.prisma);
    const groupId = await seedSydneyOffer(harness.prisma, tenantId, userId, serviceTypeId);
    const inspectorId = await seedEligibleInspector(harness.prisma, serviceTypeId);
    const sydney = await seedGlobalRegion(
      harness.prisma,
      'Global Sydney',
      SYDNEY_POLYGON_GEOJSON as unknown as Record<string, unknown>,
    );
    await linkInspectorRegion(harness.prisma, inspectorId, sydney);

    const useCase = wire(harness.prisma);
    const input = { groupId, inspectorId, actor: inspActor(inspectorId), idempotencyKey: `k-${rand()}` };
    const first = await useCase.execute(input);
    const replay = await useCase.execute(input);

    expect(replay).toEqual(first);
  });
});
