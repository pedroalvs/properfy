import { Prisma, type PrismaClient } from '@prisma/client';
import type { ReliabilityMetricResult, ReliabilityScoreStatus } from '@properfy/shared';
import type {
  NewReliabilitySnapshotRow,
  SnapshotSettings,
  StoredReliabilitySnapshotRow,
} from '../domain/reliability-snapshot.entity';
import type {
  IReliabilitySnapshotRepository,
  PurgeResult,
  ReliabilityInspectorRef,
} from '../domain/reliability-snapshot.repository';

/** A civil date string (YYYY-MM-DD) → a UTC-midnight Date for a `@db.Date` column. */
function toDateOnly(civil: string): Date {
  return new Date(`${civil}T00:00:00.000Z`);
}

/** A `@db.Date` value (UTC midnight) → its YYYY-MM-DD civil string. */
function fromDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Prisma persistence for the reliability snapshot (F07-2). Compute runs in one
 * interactive transaction (advisory lock → read → write → purge); reads use the
 * global client. No inspector coordinate is ever selected.
 */
export class PrismaReliabilitySnapshotRepository implements IReliabilitySnapshotRepository {
  constructor(private readonly prisma: PrismaClient) {}

  withComputeTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 120_000, maxWait: 10_000 });
  }

  async acquireComputeLock(tx: Prisma.TransactionClient): Promise<void> {
    // Serializes every compute run across the two Fly machines. A transaction
    // advisory lock (not a session lock) is the only kind that works behind
    // PgBouncer; the key is a stable hash of the queue name.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('reliability.compute-snapshots'))`;
  }

  async listNonDeletedInspectorIds(tx: Prisma.TransactionClient): Promise<string[]> {
    const rows = await tx.inspector.findMany({ where: { deleted_at: null }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async replaceForDate(
    tx: Prisma.TransactionClient,
    snapshotDate: string,
    rows: NewReliabilitySnapshotRow[],
  ): Promise<void> {
    await tx.inspectorReliabilitySnapshot.deleteMany({ where: { snapshot_date: toDateOnly(snapshotDate) } });
    if (rows.length === 0) return;
    await tx.inspectorReliabilitySnapshot.createMany({
      data: rows.map((row) => ({
        inspector_id: row.inspectorId,
        snapshot_date: toDateOnly(row.snapshotDate),
        window_days: row.windowDays,
        window_from: toDateOnly(row.windowFrom),
        window_to: toDateOnly(row.windowTo),
        status: row.status,
        score: row.score,
        volume: row.volume,
        completed_count: row.completedCount,
        metrics_json: row.metrics as unknown as Prisma.InputJsonValue,
        settings_json: row.settings as unknown as Prisma.InputJsonValue,
        trigger: row.trigger,
        computed_at: row.computedAt,
      })),
    });
  }

  async purgeOlderThanAndDeleted(
    tx: Prisma.TransactionClient,
    olderThanDate: string,
  ): Promise<PurgeResult> {
    const aged = await tx.inspectorReliabilitySnapshot.deleteMany({
      where: { snapshot_date: { lt: toDateOnly(olderThanDate) } },
    });
    const deleted = await tx.inspectorReliabilitySnapshot.deleteMany({
      where: { inspector: { deleted_at: { not: null } } },
    });
    return { count: aged.count, deletedInspectors: deleted.count };
  }

  async findLatestSnapshotDate(): Promise<string | null> {
    const row = await this.prisma.inspectorReliabilitySnapshot.findFirst({
      orderBy: { snapshot_date: 'desc' },
      select: { snapshot_date: true },
    });
    return row ? fromDateOnly(row.snapshot_date) : null;
  }

  async findRowsByDate(snapshotDate: string): Promise<StoredReliabilitySnapshotRow[]> {
    // Includes soft-deleted inspectors' rows so the day's meta is always present;
    // they come back with `inspectorActive=false` and `rankSnapshots` drops them.
    const rows = await this.prisma.inspectorReliabilitySnapshot.findMany({
      where: { snapshot_date: toDateOnly(snapshotDate) },
      include: { inspector: { select: { name: true, status: true, deleted_at: true } } },
    });
    return rows.map((row) => this.toStoredRow(row));
  }

  async listActiveInspectorsWithoutRow(snapshotDate: string): Promise<ReliabilityInspectorRef[]> {
    const rows = await this.prisma.inspector.findMany({
      where: {
        status: 'ACTIVE',
        deleted_at: null,
        reliability_snapshots: { none: { snapshot_date: toDateOnly(snapshotDate) } },
      },
      select: { id: true, name: true },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, active: true }));
  }

  async findInspector(inspectorId: string): Promise<ReliabilityInspectorRef | null> {
    const row = await this.prisma.inspector.findFirst({
      where: { id: inspectorId, deleted_at: null },
      select: { id: true, name: true, status: true },
    });
    return row ? { id: row.id, name: row.name, active: row.status === 'ACTIVE' } : null;
  }

  async findRowComputedAtForDate(snapshotDate: string): Promise<Date | null> {
    const row = await this.prisma.inspectorReliabilitySnapshot.findFirst({
      where: { snapshot_date: toDateOnly(snapshotDate) },
      select: { computed_at: true },
    });
    return row?.computed_at ?? null;
  }

  async findReliabilitySettingsUpdatedAt(): Promise<Date | null> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: 'reliabilityIndex' },
      select: { updated_at: true },
    });
    return row?.updated_at ?? null;
  }

  private toStoredRow(row: {
    inspector_id: string;
    snapshot_date: Date;
    window_days: number;
    window_from: Date;
    window_to: Date;
    status: string;
    score: Prisma.Decimal | null;
    volume: number;
    completed_count: number;
    metrics_json: Prisma.JsonValue;
    settings_json: Prisma.JsonValue;
    computed_at: Date;
    inspector: { name: string; status: string; deleted_at: Date | null };
  }): StoredReliabilitySnapshotRow {
    return {
      inspectorId: row.inspector_id,
      inspectorName: row.inspector.name,
      inspectorActive: row.inspector.status === 'ACTIVE' && row.inspector.deleted_at === null,
      snapshotDate: fromDateOnly(row.snapshot_date),
      windowFrom: fromDateOnly(row.window_from),
      windowTo: fromDateOnly(row.window_to),
      windowDays: row.window_days,
      status: row.status as ReliabilityScoreStatus,
      score: row.score === null ? null : Number(row.score),
      volume: row.volume,
      completedCount: row.completed_count,
      metrics: row.metrics_json as unknown as ReliabilityMetricResult[],
      settings: row.settings_json as unknown as SnapshotSettings,
      computedAt: row.computed_at,
    };
  }
}
