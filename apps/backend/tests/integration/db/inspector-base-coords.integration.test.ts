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
        repo.recordAppState({ id: row.id, now: t1, displayMode: 'standalone', appVersion: 'a', onboardingCompleted: false }),
        repo.recordAppState({ id: row.id, now: t2, displayMode: 'standalone', appVersion: 'b', onboardingCompleted: false }),
      ]);
      const after = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      const installed = after!.app_installed_at!.toISOString();
      expect([t1.toISOString(), t2.toISOString()]).toContain(installed);

      // A later standalone never changes the install timestamp.
      const t3 = new Date('2026-10-30T03:00:00.000Z');
      await repo.recordAppState({ id: row.id, now: t3, displayMode: 'standalone', appVersion: 'c', onboardingCompleted: false });
      const after3 = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      expect(after3!.app_installed_at!.toISOString()).toBe(installed);
      expect(after3!.app_last_seen_at!.toISOString()).toBe(t3.toISOString());
      expect(after3!.app_version).toBe('c');

      // F02-1 D10 / L-F01-02: the heartbeat no longer writes push_enabled (it now reflects
      // active push subscriptions, set outside the heartbeat). A push_enabled=true set
      // beforehand survives a browser heartbeat with permission denied.
      await harness.prisma.inspector.update({ where: { id: row.id }, data: { push_enabled: true } });
      const t4 = new Date('2026-10-30T04:00:00.000Z');
      await repo.recordAppState({ id: row.id, now: t4, displayMode: 'browser', appVersion: 'd', onboardingCompleted: false });
      const after4 = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      expect(after4!.app_installed_at!.toISOString()).toBe(installed);
      expect(after4!.push_enabled).toBe(true);
    });

    it('sequential standalone T1 then T2 keeps install = T1', async () => {
      const row = await createInspector({ address: VALID_ADDRESS });
      const t1 = new Date('2026-10-30T01:00:00.000Z');
      const t2 = new Date('2026-10-30T02:00:00.000Z');
      await repo.recordAppState({ id: row.id, now: t1, displayMode: 'standalone', appVersion: 'a', onboardingCompleted: false });
      await repo.recordAppState({ id: row.id, now: t2, displayMode: 'standalone', appVersion: 'b', onboardingCompleted: false });
      const after = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      expect(after!.app_installed_at!.toISOString()).toBe(t1.toISOString());
    });

    it('returns 0 affected for a soft-deleted inspector', async () => {
      const row = await createInspector({ address: VALID_ADDRESS, deleted_at: new Date() });
      const affected = await repo.recordAppState({ id: row.id, now: new Date(), displayMode: 'standalone', appVersion: 'x', onboardingCompleted: false });
      expect(affected).toBe(0);
    });

    // F04-2 (00.2, R-F01-02): onboarding_completed_at is stamped once via COALESCE
    // in the same single statement.
    it('stamps onboarding_completed_at once and never overwrites it (COALESCE)', async () => {
      const row = await createInspector({ address: VALID_ADDRESS });
      const t1 = new Date('2026-10-30T01:00:00.000Z');
      const t2 = new Date('2026-10-30T02:00:00.000Z');

      // No flag → untouched (null).
      await repo.recordAppState({ id: row.id, now: t1, displayMode: 'standalone', appVersion: 'a', onboardingCompleted: false });
      const a = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      expect(a!.onboarding_completed_at).toBeNull();

      // First completion → stamped at t1-equivalent "now".
      await repo.recordAppState({ id: row.id, now: t1, displayMode: 'standalone', appVersion: 'a', onboardingCompleted: true });
      const b = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      expect(b!.onboarding_completed_at!.toISOString()).toBe(t1.toISOString());

      // A later completion keeps the first stamp (COALESCE).
      await repo.recordAppState({ id: row.id, now: t2, displayMode: 'standalone', appVersion: 'b', onboardingCompleted: true });
      const c = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      expect(c!.onboarding_completed_at!.toISOString()).toBe(t1.toISOString());

      // A plain heartbeat (no flag) never clears it.
      await repo.recordAppState({ id: row.id, now: t2, displayMode: 'browser', appVersion: 'c', onboardingCompleted: false });
      const d = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      expect(d!.onboarding_completed_at!.toISOString()).toBe(t1.toISOString());
    });

    it('settles onboarding_completed_at under concurrent completions and does not move after', async () => {
      const row = await createInspector({ address: VALID_ADDRESS });
      const t1 = new Date('2026-10-30T01:00:00.000Z');
      const t2 = new Date('2026-10-30T02:00:00.000Z');
      await Promise.all([
        repo.recordAppState({ id: row.id, now: t1, displayMode: 'standalone', appVersion: 'a', onboardingCompleted: true }),
        repo.recordAppState({ id: row.id, now: t2, displayMode: 'standalone', appVersion: 'b', onboardingCompleted: true }),
      ]);
      const after = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      const stamped = after!.onboarding_completed_at!.toISOString();
      expect([t1.toISOString(), t2.toISOString()]).toContain(stamped);

      const t3 = new Date('2026-10-30T03:00:00.000Z');
      await repo.recordAppState({ id: row.id, now: t3, displayMode: 'standalone', appVersion: 'c', onboardingCompleted: true });
      const after3 = await harness.prisma.inspector.findUnique({ where: { id: row.id } });
      expect(after3!.onboarding_completed_at!.toISOString()).toBe(stamped);
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
