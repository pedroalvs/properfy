/**
 * Reliability snapshot job, API reader, recompute, advisory-lock serialization,
 * idempotency, retention purge and backfill against a real PostgreSQL database
 * (F07-2, TASK-F07-2 test 8). The metric MATH is covered by
 * `reliability-facts.reader.db.test.ts` + the domain unit tests; this suite proves
 * the persistence/orchestration layer only: that the job writes one row per
 * inspector, the score follows the configured weights and is recomputed when they
 * change (03.A1), the advisory lock serializes concurrent runs (the test fails if
 * the lock is removed), re-runs are idempotent, old/deleted rows are purged, and
 * the backfill enqueues the missing day.
 *
 * Requires Docker (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCivilDays, resolvePlatformSettingValue, type PlatformSettingKey, type PlatformSettingValue } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaReliabilityFactsReader } from '../../../src/modules/reliability/infrastructure/prisma-reliability-facts.reader';
import { PrismaReliabilitySnapshotRepository } from '../../../src/modules/reliability/infrastructure/prisma-reliability-snapshot.repository';
import { ReliabilityMetricsService } from '../../../src/modules/reliability/application/reliability-metrics.service';
import { ReliabilityIndexReader } from '../../../src/modules/reliability/application/reliability-index.reader';
import { ComputeReliabilitySnapshotsUseCase } from '../../../src/modules/reliability/application/use-cases/compute-reliability-snapshots.use-case';
import { EnsureTodaySnapshotUseCase } from '../../../src/modules/reliability/application/use-cases/ensure-today-snapshot.use-case';
import { RecomputeReliabilityOnSettingsChangeSubscriber } from '../../../src/modules/reliability/application/subscribers/recompute-reliability-on-settings-change.subscriber';
import { DomainEventBus, PLATFORM_SETTING_EVENTS } from '../../../src/shared/application/events/domain-event-bus';
import type { IPlatformSettingsReader } from '../../../src/shared/domain/platform-settings';

let harness: DbHarness | undefined;
let prisma: PrismaClient;
let repo: PrismaReliabilitySnapshotRepository;
let metricsService: ReliabilityMetricsService;
let reader: ReliabilityIndexReader;
let compute: ComputeReliabilitySnapshotsUseCase;
let serviceTypeId: string;

/** now whose Sydney civil date is 2026-12-01 → window [2026-11-01, 2026-11-30]. */
const NOW = new Date('2026-11-30T17:00:00.000Z');
const SNAP = '2026-12-01';

const silentLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never;

/** Reads platform_settings fresh (no cache) so a settings change is seen immediately. */
const freshSettingsReader: IPlatformSettingsReader = {
  get: async <K extends PlatformSettingKey>(key: K): Promise<PlatformSettingValue<K>> => {
    const row = await prisma.platformSetting.findUnique({ where: { key } });
    return resolvePlatformSettingValue(key, (row?.value_json ?? null) as PlatformSettingValue<K> | null).value;
  },
};

const suffix = (): string => Math.random().toString(36).slice(2, 10);

async function createAgency(name: string): Promise<{ tenantId: string; branchId: string; userId: string; propertyId: string }> {
  const tenant = await prisma.tenant.create({ data: { name, legal_name: `${name} Pty ${suffix()}`, status: 'ACTIVE' } });
  const branch = await prisma.branch.create({ data: { tenant_id: tenant.id, name: `${name} Branch`, status: 'ACTIVE' } });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, role: 'OP', name: `${name} Actor`,
      email: `rel-${suffix()}@test.local`, password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, property_code: `RL-${suffix()}`, type: 'HOUSE',
      street: `${Math.floor(Math.random() * 100_000)} Test St`, suburb: 'Testville', postcode: '2000', state: 'NSW', country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  return { tenantId: tenant.id, branchId: branch.id, userId: user.id, propertyId: property.id };
}

async function createInspector(name: string, opts: { deleted?: boolean } = {}): Promise<string> {
  const inspector = await prisma.inspector.create({
    data: { name, email: `insp-${suffix()}@test.local`, status: 'ACTIVE', deleted_at: opts.deleted ? new Date() : null },
  });
  return inspector.id;
}

async function seedExecutedDone(
  agency: { tenantId: string; branchId: string; userId: string; propertyId: string },
  inspectorId: string,
  opts: { late: boolean },
): Promise<void> {
  const appointment = await prisma.appointment.create({
    data: {
      tenant_id: agency.tenantId, branch_id: agency.branchId, property_id: agency.propertyId, service_type_id: serviceTypeId,
      status: 'DONE', inspector_id: inspectorId, scheduled_date: new Date('2026-11-10T00:00:00.000Z'),
      time_slot_start: '09:00', time_slot_end: '11:00', price_amount: '100.00', payout_amount: '80.00',
      pricing_rule_snapshot_json: {}, rental_tenant_confirmation_status: 'CONFIRMED', created_by_user_id: agency.userId,
    },
  });
  await prisma.inspectionExecution.create({
    data: {
      appointment_id: appointment.id, inspector_id: inspectorId,
      // punctual: in-window check-in 09:30 AEDT; late: out-of-window 11:20 AEDT.
      started_at: new Date(opts.late ? '2026-11-10T00:20:00.000Z' : '2026-11-09T22:30:00.000Z'),
      finished_at: new Date(opts.late ? '2026-11-10T01:00:00.000Z' : '2026-11-09T23:30:00.000Z'),
      out_of_window: opts.late,
      geofence_radius_m: 300,
      start_latitude: '-33.8000000',
      start_longitude: '151.2000000',
    },
  });
}

/** Alpha gets `punctual` on-time + `late` late DONEs (PUNCTUALITY rate = punctual/(punctual+late)). */
async function seedInspectorWithDones(
  agency: { tenantId: string; branchId: string; userId: string; propertyId: string },
  name: string,
  counts: { punctual: number; late: number },
): Promise<string> {
  const id = await createInspector(name);
  for (let i = 0; i < counts.punctual; i += 1) await seedExecutedDone(agency, id, { late: false });
  for (let i = 0; i < counts.late; i += 1) await seedExecutedDone(agency, id, { late: true });
  return id;
}

async function countSnapshots(snapshotDate: string): Promise<number> {
  const rows = await prisma.inspectorReliabilitySnapshot.findMany({ where: { snapshot_date: new Date(`${snapshotDate}T00:00:00.000Z`) } });
  return rows.length;
}

async function scoreOf(inspectorId: string, snapshotDate = SNAP): Promise<number | null> {
  const row = await prisma.inspectorReliabilitySnapshot.findFirst({
    where: { inspector_id: inspectorId, snapshot_date: new Date(`${snapshotDate}T00:00:00.000Z`) },
    select: { score: true },
  });
  return row?.score == null ? null : Number(row.score);
}

async function setReliabilityWeights(weights: Record<string, number>): Promise<void> {
  const defaults = resolvePlatformSettingValue('reliabilityIndex', null).value;
  const value = { ...defaults, weights: { ...defaults.weights, ...weights } };
  await prisma.platformSetting.upsert({
    where: { key: 'reliabilityIndex' },
    update: { value_json: value as unknown as Prisma.InputJsonValue },
    create: { key: 'reliabilityIndex', value_json: value as unknown as Prisma.InputJsonValue },
  });
}

describe('Reliability snapshot (real DB)', () => {
  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;
    repo = new PrismaReliabilitySnapshotRepository(prisma);
    metricsService = new ReliabilityMetricsService(new PrismaReliabilityFactsReader(prisma), freshSettingsReader);
    reader = new ReliabilityIndexReader(repo);
    compute = new ComputeReliabilitySnapshotsUseCase(repo, metricsService, freshSettingsReader, silentLogger);
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "inspector_reliability_snapshots", "inspection_executions", "inspector_field_events",
         "day_plan_stops", "day_plans", "satisfaction_surveys", "audit_logs", "appointments", "properties",
         "service_types", "users", "branches", "tenants", "inspectors", "platform_settings" CASCADE`,
    );
    const st = await prisma.serviceType.create({
      data: { code: `RL-${suffix()}`, name: `Routine ${suffix()}`, flow_type: 'ROUTINE', default_duration_minutes: 60 },
    });
    serviceTypeId = st.id;
  });

  it('writes one row per non-deleted inspector and the reader ranks the scored ones', async () => {
    const agency = await createAgency('Rank');
    const alpha = await seedInspectorWithDones(agency, 'Alpha', { punctual: 10, late: 2 }); // 12 → SCORED
    const beta = await seedInspectorWithDones(agency, 'Beta', { punctual: 3, late: 0 }); // 3 < 10 → not enough

    const result = await compute.execute({ trigger: 'SCHEDULED', now: NOW });
    expect(result.snapshotDate).toBe(SNAP);
    expect(await countSnapshots(SNAP)).toBe(2);

    const loaded = await reader.loadLatest();
    expect(loaded?.snapshotDate).toBe(SNAP);
    const indexes = await reader.getCurrentIndexes();
    const byId = new Map(indexes.map((i) => [i.inspectorId, i]));
    expect(byId.get(alpha)?.status).toBe('SCORED');
    expect(byId.get(alpha)?.position).toBe(1);
    expect(byId.get(beta)?.status).toBe('INSUFFICIENT_VOLUME');
    expect(byId.get(beta)?.position).toBeNull();
  });

  it('is idempotent — three runs leave exactly one row per inspector', async () => {
    const agency = await createAgency('Idem');
    await seedInspectorWithDones(agency, 'Alpha', { punctual: 10, late: 2 });
    await seedInspectorWithDones(agency, 'Beta', { punctual: 2, late: 0 });

    await compute.execute({ trigger: 'SCHEDULED', now: NOW });
    await compute.execute({ trigger: 'SCHEDULED', now: NOW });
    await compute.execute({ trigger: 'SCHEDULED', now: NOW });

    expect(await countSnapshots(SNAP)).toBe(2);
  });

  it('03.A1: the score follows the configured weights and is recomputed when they change', async () => {
    const agency = await createAgency('Weights');
    const alpha = await seedInspectorWithDones(agency, 'Alpha', { punctual: 6, late: 6 }); // PUNCTUALITY rate 0.5

    await compute.execute({ trigger: 'SCHEDULED', now: NOW });
    const before = await scoreOf(alpha);
    expect(before).not.toBeNull();

    // Weight ONLY punctuality (rate 0.5) → score must become exactly 50.0.
    await setReliabilityWeights({
      PUNCTUALITY: 1, GEOFENCE: 0, NO_STUCK: 0, SATISFACTION: 0, LATE_NOTICE: 0, CANT_ATTEND: 0, VOLUME: 0, DONE_REJECTED: 0,
    });
    await compute.execute({ trigger: 'SETTINGS_CHANGED', now: NOW });
    const after = await scoreOf(alpha);

    expect(after).toBe(50);
    expect(after).not.toBe(before);
  });

  it('03.A1 wiring: the F03 settings event enqueues a SETTINGS_CHANGED recompute (reliabilityIndex only)', async () => {
    const bus = new DomainEventBus();
    const enqueue = vi.fn(async () => {});
    const subscriber = new RecomputeReliabilityOnSettingsChangeSubscriber({ enqueue }, silentLogger);
    bus.subscribe(PLATFORM_SETTING_EVENTS.UPDATED, (e) => subscriber.handle(e));

    await bus.emit({
      type: PLATFORM_SETTING_EVENTS.UPDATED,
      payload: { key: 'reliabilityIndex', before: {}, after: {}, actorId: 'am-1', occurredAt: NOW.toISOString() },
      occurredAt: NOW,
    });
    await bus.emit({
      type: PLATFORM_SETTING_EVENTS.UPDATED,
      payload: { key: 'fieldEvents', before: {}, after: {}, actorId: 'am-1', occurredAt: NOW.toISOString() },
      occurredAt: NOW,
    });

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith('reliability.compute-snapshots', { trigger: 'SETTINGS_CHANGED' }, expect.any(Object));
  });

  it('acquireComputeLock serializes compute across connections (fails if the lock is removed)', async () => {
    // The advisory lock is the serialization guard. Proven directly on two separate
    // connections: while A holds the lock inside its transaction, B must BLOCK on
    // acquireComputeLock and only proceed once A commits. If the lock is a no-op, B
    // acquires immediately and `bAcquired` is true at the mid-check — this test fails.
    const clientA = new PrismaClient({ datasources: { db: { url: harness!.connectionString } } });
    const clientB = new PrismaClient({ datasources: { db: { url: harness!.connectionString } } });
    const repoA = new PrismaReliabilitySnapshotRepository(clientA);
    const repoB = new PrismaReliabilitySnapshotRepository(clientB);
    const events: string[] = [];
    let bAcquired = false;
    let releaseA!: () => void;
    const aHold = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    try {
      const aDone = clientA.$transaction(
        async (tx) => {
          await repoA.acquireComputeLock(tx);
          events.push('A-acquired');
          await aHold; // keep A's transaction (and the lock) open
          events.push('A-releasing');
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
      await new Promise((r) => setTimeout(r, 150)); // let A acquire first

      const bDone = clientB.$transaction(
        async (tx) => {
          await repoB.acquireComputeLock(tx);
          bAcquired = true;
          events.push('B-acquired');
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
      await new Promise((r) => setTimeout(r, 300)); // B should still be blocked here
      expect(bAcquired).toBe(false);

      releaseA();
      await aDone;
      await bDone;
      expect(bAcquired).toBe(true);
      expect(events).toEqual(['A-acquired', 'A-releasing', 'B-acquired']);
    } finally {
      await clientA.$disconnect();
      await clientB.$disconnect();
    }
  });

  it('concurrent full runs do not corrupt the day (both resolve, one row per inspector)', async () => {
    const agency = await createAgency('Concurrent');
    await seedInspectorWithDones(agency, 'Alpha', { punctual: 10, late: 1 });
    await seedInspectorWithDones(agency, 'Beta', { punctual: 11, late: 0 });

    const results = await Promise.all([
      compute.execute({ trigger: 'SCHEDULED', now: NOW }),
      compute.execute({ trigger: 'SCHEDULED', now: NOW }),
    ]);
    expect(results).toHaveLength(2);
    expect(await countSnapshots(SNAP)).toBe(2);
  });

  it('purges rows older than 400 days and all rows of soft-deleted inspectors on a SCHEDULED run', async () => {
    const agency = await createAgency('Purge');
    const alpha = await seedInspectorWithDones(agency, 'Alpha', { punctual: 10, late: 1 });
    const gamma = await createInspector('Gamma', { deleted: true });

    const old401 = addCivilDays(SNAP, -401);
    const old400 = addCivilDays(SNAP, -400);
    const recent = addCivilDays(SNAP, -2);
    const baseRow = (inspectorId: string, date: string) => ({
      inspector_id: inspectorId, snapshot_date: new Date(`${date}T00:00:00.000Z`), window_days: 30,
      window_from: new Date(`${addCivilDays(date, -30)}T00:00:00.000Z`), window_to: new Date(`${addCivilDays(date, -1)}T00:00:00.000Z`),
      status: 'INSUFFICIENT_VOLUME', score: null, volume: 0, completed_count: 0, metrics_json: [], settings_json: {},
      trigger: 'SCHEDULED', computed_at: new Date(),
    });
    await prisma.inspectorReliabilitySnapshot.createMany({
      data: [baseRow(alpha, old401), baseRow(alpha, old400), baseRow(gamma, recent)],
    });

    await compute.execute({ trigger: 'SCHEDULED', now: NOW });

    const remaining = await prisma.inspectorReliabilitySnapshot.findMany({ select: { inspector_id: true, snapshot_date: true } });
    const dates = remaining.map((r) => r.snapshot_date.toISOString().slice(0, 10));
    expect(dates).not.toContain(old401); // older than 400 days → purged
    expect(dates).toContain(old400); // exactly 400 days → kept
    expect(remaining.some((r) => r.inspector_id === gamma)).toBe(false); // deleted inspector → purged
    expect(remaining.some((r) => r.inspector_id === alpha && r.snapshot_date.toISOString().slice(0, 10) === SNAP)).toBe(true);
  });

  it('backfill: ensure-today enqueues when today has no row, and does nothing once it exists', async () => {
    const agency = await createAgency('Backfill');
    await seedInspectorWithDones(agency, 'Alpha', { punctual: 10, late: 1 });

    const enqueue = vi.fn(async () => {});
    const ensureToday = new EnsureTodaySnapshotUseCase(
      { enqueue },
      (d) => repo.findRowComputedAtForDate(d),
      () => repo.findReliabilitySettingsUpdatedAt(),
      silentLogger,
    );

    expect(await ensureToday.execute({ now: NOW })).toBe('ENQUEUED_MISSING');
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith('reliability.compute-snapshots', { trigger: 'BACKFILL' }, expect.any(Object));

    await compute.execute({ trigger: 'BACKFILL', now: NOW });
    enqueue.mockClear();
    expect(await ensureToday.execute({ now: NOW })).toBe('UP_TO_DATE');
    expect(enqueue).not.toHaveBeenCalled();
  });
});
