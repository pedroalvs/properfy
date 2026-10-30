/**
 * F01-1 real-database tests (testcontainers). Proves the migration applies, the
 * Decimal(10,7) round-trip, the coordinate compare-and-set, and the single-SQL
 * heartbeat's concurrency behaviour — none of which a mocked Prisma can show.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaInspectorRepository } from '../../../src/modules/inspector/infrastructure/prisma-inspector.repository';
import { backfillInspectorBaseCoords } from '../../../src/scripts/backfill-inspector-base-coords';
import type { IGeocodingService } from '../../../src/modules/property/domain/geocoding.service';

let harness: DbHarness;
let repo: PrismaInspectorRepository;

const VALID_ADDRESS = {
  street: '1 George St',
  suburb: 'Sydney',
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'AU',
};

function email(): string {
  return `insp-${Math.random().toString(36).slice(2, 10)}@test.local`;
}

async function createInspector(data: Record<string, unknown> = {}) {
  return harness.prisma.inspector.create({
    data: { name: 'Base Test', email: email(), ...data } as never,
  });
}

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaInspectorRepository(harness.prisma);
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('F01-1 inspector base coords + heartbeat (real DB)', () => {
  it('applies the migration (the seven new columns accept values)', async () => {
    const row = await createInspector({
      base_lat: new Prisma.Decimal('-33.8688197'),
      base_lng: new Prisma.Decimal('151.2092955'),
      base_geocoded_at: new Date(),
      app_installed_at: new Date(),
      app_last_seen_at: new Date(),
      push_enabled: true,
      app_version: '0.1.0',
    });
    expect(row.base_lat).not.toBeNull();
    expect(row.push_enabled).toBe(true);
  });

  it('round-trips Decimal(10,7) coordinates to number without relevant loss', async () => {
    const row = await createInspector({
      base_lat: new Prisma.Decimal('-33.8688197'),
      base_lng: new Prisma.Decimal('151.2092955'),
      base_geocoded_at: new Date(),
    });
    const entity = await repo.findById(row.id);
    expect(entity?.baseLat).toBeCloseTo(-33.8688197, 7);
    expect(entity?.baseLng).toBeCloseTo(151.2092955, 7);
    expect(typeof entity?.baseLat).toBe('number');
  });

  it('CAS updateMany({base_lat:null}) does not overwrite an already-located row', async () => {
    const row = await createInspector({ address: VALID_ADDRESS, base_lat: new Prisma.Decimal('1'), base_lng: new Prisma.Decimal('2'), base_geocoded_at: new Date() });
    const res = await harness.prisma.inspector.updateMany({
      where: { id: row.id, base_lat: null },
      data: { base_lat: new Prisma.Decimal('9'), base_lng: new Prisma.Decimal('9'), base_geocoded_at: new Date() },
    });
    expect(res.count).toBe(0);
  });

  describe('recordAppState (single-statement heartbeat)', () => {
    it('records the first standalone exactly once under concurrency and never overwrites it', async () => {
      const row = await createInspector({ address: VALID_ADDRESS });
      const t1 = new Date('2026-10-30T01:00:00.000Z');
      const t2 = new Date('2026-10-30T02:00:00.000Z');
      await Promise.all([
        repo.recordAppState({ id: row.id, now: t1, displayMode: 'standalone', pushEnabled: true, appVersion: 'a' }),
        repo.recordAppState({ id: row.id, now: t2, displayMode: 'standalone', pushEnabled: false, appVersion: 'b' }),
      ]);
      const after = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      const installed = after!.app_installed_at!.toISOString();
      expect([t1.toISOString(), t2.toISOString()]).toContain(installed);

      // A later standalone never changes the install timestamp.
      const t3 = new Date('2026-10-30T03:00:00.000Z');
      await repo.recordAppState({ id: row.id, now: t3, displayMode: 'standalone', pushEnabled: true, appVersion: 'c' });
      const after3 = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      expect(after3!.app_installed_at!.toISOString()).toBe(installed);
      expect(after3!.app_last_seen_at!.toISOString()).toBe(t3.toISOString());
      expect(after3!.app_version).toBe('c');

      // A browser heartbeat keeps the install and flips push off.
      const t4 = new Date('2026-10-30T04:00:00.000Z');
      await repo.recordAppState({ id: row.id, now: t4, displayMode: 'browser', pushEnabled: false, appVersion: 'd' });
      const after4 = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      expect(after4!.app_installed_at!.toISOString()).toBe(installed);
      expect(after4!.push_enabled).toBe(false);
    });

    it('sequential standalone T1 then T2 keeps install = T1', async () => {
      const row = await createInspector({ address: VALID_ADDRESS });
      const t1 = new Date('2026-10-30T01:00:00.000Z');
      const t2 = new Date('2026-10-30T02:00:00.000Z');
      await repo.recordAppState({ id: row.id, now: t1, displayMode: 'standalone', pushEnabled: true, appVersion: 'a' });
      await repo.recordAppState({ id: row.id, now: t2, displayMode: 'standalone', pushEnabled: true, appVersion: 'b' });
      const after = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      expect(after!.app_installed_at!.toISOString()).toBe(t1.toISOString());
    });

    it('returns 0 affected for a soft-deleted inspector', async () => {
      const row = await createInspector({ address: VALID_ADDRESS, deleted_at: new Date() });
      const affected = await repo.recordAppState({ id: row.id, now: new Date(), displayMode: 'standalone', pushEnabled: true, appVersion: 'x' });
      expect(affected).toBe(0);
    });
  });

  it('backfill selection excludes JSON null and SQL NULL addresses', async () => {
    // Isolate: only the rows this test creates should be scanned.
    await harness.prisma.$executeRawUnsafe('TRUNCATE TABLE "inspectors" CASCADE');
    await createInspector({ address: VALID_ADDRESS }); // base_lat null, real address → scanned
    await createInspector({ address: Prisma.JsonNull }); // JSON 'null' → excluded
    await createInspector({ address: Prisma.DbNull }); // SQL NULL → excluded

    const geocoder: IGeocodingService = { geocode: async () => null };
    const report = await backfillInspectorBaseCoords(
      { prisma: harness.prisma, geocoder, isConfigured: async () => true, auditService: { log: () => {} } },
      { apply: false },
    );
    expect(report.scanned).toBe(1);
    expect(report.compatible).toBe(1);
  });
});
