import type { Prisma } from '@prisma/client';
import type { NewReliabilitySnapshotRow, StoredReliabilitySnapshotRow } from './reliability-snapshot.entity';

/** Minimal inspector identity the reliability reads/compute need. */
export interface ReliabilityInspectorRef {
  id: string;
  name: string;
  /** `inspectors.status === 'ACTIVE'`. */
  active: boolean;
}

export interface PurgeResult {
  /** Rows removed for being past the retention horizon. */
  count: number;
  /** Rows removed because their inspector is soft-deleted. */
  deletedInspectors: number;
}

/**
 * Persistence port for the reliability snapshot (F07-2). Compute methods take a
 * transaction client so the whole run (advisory lock → read → write → purge) is
 * one serialized unit; reads use the global client. No method returns an
 * inspector coordinate (privacy, root CLAUDE.md §7.9).
 */
export interface IReliabilitySnapshotRepository {
  // --- compute (transaction-scoped) ---

  /** Runs `fn` inside an interactive transaction (`timeout 120s`, `maxWait 10s`). */
  withComputeTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;

  /** `pg_advisory_xact_lock(hashtext('reliability.compute-snapshots'))` — serializes runs across instances. */
  acquireComputeLock(tx: Prisma.TransactionClient): Promise<void>;

  /** Ids of every non-deleted inspector (ACTIVE and INACTIVE) — the row set to write. */
  listNonDeletedInspectorIds(tx: Prisma.TransactionClient): Promise<string[]>;

  /** Atomically replaces the day's rows: delete all rows for `snapshotDate`, then insert `rows`. */
  replaceForDate(
    tx: Prisma.TransactionClient,
    snapshotDate: string,
    rows: NewReliabilitySnapshotRow[],
  ): Promise<void>;

  /** Deletes rows with `snapshot_date < olderThanDate` and all rows of soft-deleted inspectors. */
  purgeOlderThanAndDeleted(tx: Prisma.TransactionClient, olderThanDate: string): Promise<PurgeResult>;

  // --- reads ---

  /** The most recent `snapshot_date` present, or `null` when the table is empty. */
  findLatestSnapshotDate(): Promise<string | null>;

  /** Every row for `snapshotDate`, joined with the inspector's name and active flag (excludes deleted inspectors). */
  findRowsByDate(snapshotDate: string): Promise<StoredReliabilitySnapshotRow[]>;

  /** ACTIVE, non-deleted inspectors that have no row for `snapshotDate` (created after the compute). */
  listActiveInspectorsWithoutRow(snapshotDate: string): Promise<ReliabilityInspectorRef[]>;

  /** One inspector's identity, or `null` when unknown or soft-deleted. */
  findInspector(inspectorId: string): Promise<ReliabilityInspectorRef | null>;

  /** `computed_at` of any row for `snapshotDate` (all rows of a run share it), or `null` when none exists. */
  findRowComputedAtForDate(snapshotDate: string): Promise<Date | null>;

  /** `platform_settings.updated_at` of the `reliabilityIndex` key, or `null` if never saved. */
  findReliabilitySettingsUpdatedAt(): Promise<Date | null>;
}
