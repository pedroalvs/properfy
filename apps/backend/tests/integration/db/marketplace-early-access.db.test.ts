/**
 * Real-database tests for the F08-2 early-access window across the four marketplace
 * paths (list, count, detail, accept-state), with PostGIS region matching and the
 * F07 reliability snapshots. Exercises the SQL exclusion fragment directly through
 * the repository, with EarlyAccessParams constructed as the policy would (a viewer
 * who does NOT qualify gets params; one who qualifies gets null).
 *
 * World: region R (Sydney) + region S (Melbourne), service type T.
 *   Gina — Gold (score 90), linked to R, serves T.
 *   Sam  — Silver (score 70), linked to R, serves T.
 *   Gus  — Gold (score 90), linked to S only, serves T.
 * H = 12, minLevel GOLD (minScore 85), snapshot date = today (Sydney).
 *
 * Dates are RELATIVE to today-Sydney so the base `scheduled_date >= CURRENT_DATE`
 * filter holds regardless of the real run date.
 *
 * Requires Docker (testcontainers) + PostGIS. Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { addCivilDays, civilDateInTz, PLATFORM_TIMEZONE } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import {
  seedTenant,
  seedInspector,
  SYDNEY_POLYGON_GEOJSON,
  MELBOURNE_POLYGON_GEOJSON,
  POINT_INSIDE_SYDNEY,
  POINT_INSIDE_MELBOURNE,
} from '../service-region/helpers/service-region-fixtures';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import type { EarlyAccessParams } from '../../../src/modules/service-group/domain/early-access';

let harness: DbHarness;

beforeAll(async () => {
  harness = await setupDbHarness();
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE inspector_reliability_snapshots, appointments, service_groups, properties, service_types, inspector_regions, service_regions, inspectors, users, branches, tenants CASCADE`,
  );
});

const NOW = new Date();
const TODAY = civilDateInTz(NOW, PLATFORM_TIMEZONE);
const PROTECTED_FROM = addCivilDays(TODAY, 2);
const D_PLUS_3 = addCivilDays(TODAY, 3);
const D_PLUS_1 = addCivilDays(TODAY, 1);

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}
function civilToDate(civil: string): Date {
  return new Date(`${civil}T00:00:00.000Z`);
}
function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3_600_000);
}

/** EarlyAccessParams as the policy would build them for a NON-qualifying viewer. */
function params(overrides: Partial<EarlyAccessParams> = {}): EarlyAccessParams {
  return {
    hours: 12,
    cutoffUtc: hoursAgo(12).toISOString().replace('Z', ''),
    enabledAtUtc: '2020-01-01T00:00:00.000', // long ago: every group is published after activation
    protectedFrom: PROTECTED_FROM,
    minScore: 85, // GOLD threshold
    latestSnapshotDate: TODAY,
    ...overrides,
  };
}

async function getBranchId(prisma: PrismaClient, tenantId: string): Promise<string> {
  const branch = await prisma.branch.findFirst({ where: { tenant_id: tenantId } });
  if (!branch) throw new Error('Branch not found for tenant');
  return branch.id;
}

async function seedServiceType(prisma: PrismaClient): Promise<string> {
  const st = await prisma.serviceType.create({
    data: {
      code: `ST-${rand()}`,
      name: `Routine ${rand()}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  return st.id;
}

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
    )`;
  return regionId;
}

async function linkInspectorRegion(prisma: PrismaClient, inspectorId: string, regionId: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO inspector_regions (inspector_id, region_id, assigned_at)
    VALUES (${inspectorId}, ${regionId}, NOW())`;
}

async function seedInspectorFor(
  prisma: PrismaClient,
  serviceTypeId: string,
  regionId: string,
): Promise<string> {
  const { inspectorId } = await seedInspector(prisma, `Insp ${rand()}`);
  await prisma.inspector.update({
    where: { id: inspectorId },
    data: { service_types_json: [{ serviceTypeId, certified: true }], blocked_clients_json: [] },
  });
  await linkInspectorRegion(prisma, inspectorId, regionId);
  return inspectorId;
}

async function seedSnapshot(
  prisma: PrismaClient,
  inspectorId: string,
  score: number,
  snapshotDate: string = TODAY,
  status = 'SCORED',
): Promise<void> {
  await prisma.inspectorReliabilitySnapshot.create({
    data: {
      inspector_id: inspectorId,
      snapshot_date: civilToDate(snapshotDate),
      window_days: 30,
      window_from: civilToDate(addCivilDays(snapshotDate, -30)),
      window_to: civilToDate(addCivilDays(snapshotDate, -1)),
      status,
      score,
      volume: 20,
      completed_count: 20,
      metrics_json: [],
      settings_json: {},
      trigger: 'SCHEDULED',
      computed_at: new Date(),
    },
  });
}

async function seedOffer(
  prisma: PrismaClient,
  opts: {
    tenantId: string;
    userId: string;
    serviceTypeId: string;
    scheduledDate: string;
    publishedAt: Date | null;
    point: { lng: number; lat: number };
  },
): Promise<string> {
  const branchId = await getBranchId(prisma, opts.tenantId);
  // Unique street per property: `properties` has a unique (tenant_id,
  // normalized_address_key), so a fixed address collides when a test seeds
  // more than one offer for the same tenant.
  const street = `${rand()} Test St`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO properties (id, tenant_id, branch_id, property_code, type, street, suburb, postcode, state, country, geocoding_status, coordinates, created_at, updated_at)
    VALUES (
      gen_random_uuid(), ${opts.tenantId}, ${branchId}, ${'P-' + rand()}, 'HOUSE', ${street}, 'Town', '2000', 'NSW', 'AU', 'SUCCESS',
      ST_SetSRID(ST_MakePoint(${opts.point.lng}, ${opts.point.lat}), 4326),
      NOW(), NOW()
    ) RETURNING id`;
  const group = await prisma.serviceGroup.create({
    data: {
      service_type_id: opts.serviceTypeId,
      status: 'PUBLISHED',
      scheduled_date: civilToDate(opts.scheduledDate),
      time_window: '08:00-12:00',
      published_at: opts.publishedAt,
      created_by_user_id: opts.userId,
    },
  });
  await prisma.appointment.create({
    data: {
      tenant_id: opts.tenantId,
      branch_id: branchId,
      property_id: rows[0]!.id,
      service_type_id: opts.serviceTypeId,
      status: 'AWAITING_INSPECTOR',
      scheduled_date: civilToDate(opts.scheduledDate),
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: opts.userId,
      service_group_id: group.id,
    },
  });
  return group.id;
}

interface World {
  tenantId: string;
  userId: string;
  serviceTypeId: string;
  regionR: string;
  regionS: string;
  gina: string;
  sam: string;
  gus: string;
  repo: PrismaServiceGroupRepository;
  seedR: (scheduledDate: string, publishedAt: Date | null) => Promise<string>;
}

async function setupWorld(): Promise<World> {
  const prisma = harness.prisma;
  const { tenantId, userId } = await seedTenant(prisma, 'Agency A');
  const serviceTypeId = await seedServiceType(prisma);
  const regionR = await seedGlobalRegion(prisma, 'R Sydney', SYDNEY_POLYGON_GEOJSON as any);
  const regionS = await seedGlobalRegion(prisma, 'S Melbourne', MELBOURNE_POLYGON_GEOJSON as any);
  const gina = await seedInspectorFor(prisma, serviceTypeId, regionR);
  const sam = await seedInspectorFor(prisma, serviceTypeId, regionR);
  const gus = await seedInspectorFor(prisma, serviceTypeId, regionS);
  await seedSnapshot(prisma, gina, 90);
  await seedSnapshot(prisma, sam, 70);
  await seedSnapshot(prisma, gus, 90);
  const repo = new PrismaServiceGroupRepository(prisma);
  const seedR = (scheduledDate: string, publishedAt: Date | null) =>
    seedOffer(prisma, {
      tenantId,
      userId,
      serviceTypeId,
      scheduledDate,
      publishedAt,
      point: POINT_INSIDE_SYDNEY,
    });
  return { tenantId, userId, serviceTypeId, regionR, regionS, gina, sam, gus, repo, seedR };
}

const PAGINATION = { page: 1, pageSize: 50, sortOrder: 'asc' as const };

/** Ids a viewer sees in the list, given earlyAccess params (null = qualifies/disabled). */
async function listedIds(
  repo: PrismaServiceGroupRepository,
  inspectorId: string,
  serviceTypeId: string,
  ea: EarlyAccessParams | null,
): Promise<string[]> {
  const offers = await repo.findPublishedForInspector(inspectorId, [serviceTypeId], [], PAGINATION, ea);
  return offers.map((o) => o.groupId).sort();
}

describe('Marketplace early access (real DB)', () => {
  it('gates the four paths: Sam (Silver) is denied an in-window D+3 group that Gina (Gold) sees', async () => {
    const w = await setupWorld();
    const g1 = await w.seedR(D_PLUS_3, hoursAgo(1)); // in window

    // Gina qualifies → policy passes null → she sees it.
    expect(await listedIds(w.repo, w.gina, w.serviceTypeId, null)).toContain(g1);
    // Sam does not qualify → params → hidden from list, count and detail.
    const sam = params();
    expect(await listedIds(w.repo, w.sam, w.serviceTypeId, sam)).not.toContain(g1);
    expect(await w.repo.countPublishedForInspector(w.sam, [w.serviceTypeId], [], sam)).toBe(0);
    expect(await w.repo.findPublishedOfferDetail(g1, w.sam, [w.serviceTypeId], [], sam)).toBeNull();
    expect(await w.repo.findPublishedOfferDetail(g1, w.gina, [w.serviceTypeId], [], null)).not.toBeNull();

    // Accept-state matches the list decision.
    const state = await w.repo.findEarlyAccessStateForGroup(g1, sam);
    expect(state).toMatchObject({ scheduledDate: D_PLUS_3, hasQualifiedEligible: true });
    expect(state!.publishedAt).not.toBeNull();
  });

  it('boundary: a group published exactly H hours ago is visible to Sam', async () => {
    const w = await setupWorld();
    const g3 = await w.seedR(D_PLUS_3, hoursAgo(12)); // published_at == cutoff → not > cutoff
    expect(await listedIds(w.repo, w.sam, w.serviceTypeId, params())).toContain(g3);
  });

  it('a group published over H hours ago, with null published_at, or for today/D+1 is visible to Sam', async () => {
    const w = await setupWorld();
    const old = await w.seedR(D_PLUS_3, hoursAgo(72));
    const legacy = await w.seedR(D_PLUS_3, null);
    const dplus1 = await w.seedR(D_PLUS_1, hoursAgo(1));
    const today = await w.seedR(TODAY, hoursAgo(1));
    const samIds = await listedIds(w.repo, w.sam, w.serviceTypeId, params());
    expect(samIds).toEqual(expect.arrayContaining([old, legacy, dplus1, today]));
  });

  it('count matches the listed ids and pagination applies the filter before LIMIT/OFFSET', async () => {
    const w = await setupWorld();
    const gated = await w.seedR(D_PLUS_3, hoursAgo(1)); // hidden from Sam
    const visibleA = await w.seedR(D_PLUS_1, hoursAgo(1)); // D+1 → visible
    const visibleB = await w.seedR(TODAY, hoursAgo(1)); // today → visible
    const sam = params();

    expect(await w.repo.countPublishedForInspector(w.sam, [w.serviceTypeId], [], sam)).toBe(2);
    const page1 = await w.repo.findPublishedForInspector(w.sam, [w.serviceTypeId], [], { page: 1, pageSize: 2, sortOrder: 'asc' }, sam);
    expect(page1.map((o) => o.groupId).sort()).toEqual([visibleA, visibleB].sort());
    expect(page1.map((o) => o.groupId)).not.toContain(gated);
  });

  it('visibility is restored once the window has passed (simulated by moving the cutoff)', async () => {
    const w = await setupWorld();
    const g1 = await w.seedR(D_PLUS_3, hoursAgo(1));
    // "12h later": cutoff advances to g1.publishedAt → published_at is no longer > cutoff.
    const advanced = params({ cutoffUtc: hoursAgo(1).toISOString().replace('Z', '') });
    expect(await listedIds(w.repo, w.sam, w.serviceTypeId, advanced)).toContain(g1);
  });

  it('(DV3) a group with no qualified-eligible inspector is visible to Sam even inside the window', async () => {
    const w = await setupWorld();
    // Only Gold in R is Gina; deactivate her → no Gold is eligible for an R group.
    await harness.prisma.inspector.update({ where: { id: w.gina }, data: { status: 'INACTIVE' } });
    const g1 = await w.seedR(D_PLUS_3, hoursAgo(1));
    expect(await listedIds(w.repo, w.sam, w.serviceTypeId, params())).toContain(g1);
    const state = await w.repo.findEarlyAccessStateForGroup(g1, params());
    expect(state!.hasQualifiedEligible).toBe(false);
  });

  it('(DV3) when the only Gold covers another region, an R group has no qualified-eligible and is visible to Sam', async () => {
    const w = await setupWorld();
    // Make Gina a Silver so the ONLY Gold is Gus, who covers region S only. An R
    // group then has no qualified-eligible Gold (region mismatch), so Sam sees it.
    await harness.prisma.inspectorReliabilitySnapshot.updateMany({
      where: { inspector_id: w.gina },
      data: { score: 70 },
    });
    const g1 = await w.seedR(D_PLUS_3, hoursAgo(1));
    // Sanity: Gus (Gold) does not even see an R group (out of region).
    expect(await listedIds(w.repo, w.gus, w.serviceTypeId, null)).not.toContain(g1);
    expect(await listedIds(w.repo, w.sam, w.serviceTypeId, params())).toContain(g1);
    const state = await w.repo.findEarlyAccessStateForGroup(g1, params());
    expect(state!.hasQualifiedEligible).toBe(false);
  });

  it('(L-F08-08) a group published before enabledAt is visible to Sam; one published after is hidden', async () => {
    const w = await setupWorld();
    const enabledAt = hoursAgo(0.5); // 30 min ago
    const beforeActivation = await w.seedR(D_PLUS_3, hoursAgo(1)); // 1h ago, before enabledAt
    const afterActivation = await w.seedR(D_PLUS_3, hoursAgo(0.1)); // 6 min ago, after enabledAt
    const sam = params({ enabledAtUtc: enabledAt.toISOString().replace('Z', '') });
    const ids = await listedIds(w.repo, w.sam, w.serviceTypeId, sam);
    expect(ids).toContain(beforeActivation);
    expect(ids).not.toContain(afterActivation);
    // Gina (null params) sees both.
    const ginaIds = await listedIds(w.repo, w.gina, w.serviceTypeId, null);
    expect(ginaIds).toEqual(expect.arrayContaining([beforeActivation, afterActivation]));
  });

  it('with no reliability snapshot for the date, no one qualifies so the group is visible to Sam', async () => {
    const w = await setupWorld();
    const g1 = await w.seedR(D_PLUS_3, hoursAgo(1));
    // Point the params at a snapshot date with no rows.
    const sam = params({ latestSnapshotDate: addCivilDays(TODAY, -5) });
    expect(await listedIds(w.repo, w.sam, w.serviceTypeId, sam)).toContain(g1);
  });

  it('the exclusion is session-timezone independent (Sydney vs UTC)', async () => {
    const w = await setupWorld();
    const g1 = await w.seedR(D_PLUS_3, hoursAgo(1));
    const sam = params();
    await harness.prisma.$executeRawUnsafe(`SET TIME ZONE 'Australia/Sydney'`);
    const sydney = await listedIds(w.repo, w.sam, w.serviceTypeId, sam);
    await harness.prisma.$executeRawUnsafe(`SET TIME ZONE 'UTC'`);
    const utc = await listedIds(w.repo, w.sam, w.serviceTypeId, sam);
    await harness.prisma.$executeRawUnsafe(`SET TIME ZONE DEFAULT`);
    expect(sydney).toEqual(utc);
    expect(sydney).not.toContain(g1);
  });
});
