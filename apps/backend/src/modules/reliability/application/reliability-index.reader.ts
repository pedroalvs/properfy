import type { ReliabilityDetailStatus } from '@properfy/shared';
import { positionOf, rankSnapshots, type RankCandidate } from '../domain/ranking';
import type { SnapshotSettings, StoredReliabilitySnapshotRow } from '../domain/reliability-snapshot.entity';
import type { IReliabilitySnapshotRepository, ReliabilityInspectorRef } from '../domain/reliability-snapshot.repository';

/** The latest snapshot loaded once: meta + ranking candidates + the rows by inspector. */
export interface LoadedSnapshot {
  snapshotDate: string;
  windowFrom: string;
  windowTo: string;
  computedAt: Date;
  settings: SnapshotSettings;
  candidates: RankCandidate[];
  rowsByInspector: Map<string, StoredReliabilitySnapshotRow>;
}

/** One inspector's current index entry (exported shape for F08). */
export interface CurrentIndex {
  inspectorId: string;
  score: number | null;
  status: ReliabilityDetailStatus;
  position: number | null;
  volume: number;
  snapshotDate: string | null;
}

function buildCandidates(
  rows: StoredReliabilitySnapshotRow[],
  withoutRow: ReliabilityInspectorRef[],
): RankCandidate[] {
  return [
    ...rows.map((r) => ({
      inspectorId: r.inspectorId,
      inspectorName: r.inspectorName,
      active: r.inspectorActive,
      snapshot: { status: r.status, score: r.score, volume: r.volume, completedCount: r.completedCount },
    })),
    ...withoutRow.map((i) => ({
      inspectorId: i.id,
      inspectorName: i.name,
      active: true,
      snapshot: null,
    })),
  ];
}

/**
 * Reads the current reliability index from the latest snapshot. Shared by the
 * AM/OP ranking/detail use cases and exported for F08 (`getCurrentIndexes`). The
 * `position` is always the platform-wide competition ranking (R2): filtering by a
 * subset narrows only the output, never the position. `snapshotDate` may be
 * earlier than today (the consumer records its own as-of date); there is no
 * uncached read.
 */
export class ReliabilityIndexReader {
  constructor(private readonly repo: IReliabilitySnapshotRepository) {}

  /** Loads the latest snapshot's candidates + meta, or `null` when none exists. */
  async loadLatest(): Promise<LoadedSnapshot | null> {
    const snapshotDate = await this.repo.findLatestSnapshotDate();
    if (snapshotDate === null) return null;

    const [rows, withoutRow] = await Promise.all([
      this.repo.findRowsByDate(snapshotDate),
      this.repo.listActiveInspectorsWithoutRow(snapshotDate),
    ]);
    // `snapshotDate` came from an existing row, and `findRowsByDate` includes
    // soft-deleted inspectors' rows, so `rows` is normally non-empty; guard anyway.
    const meta = rows[0];
    if (!meta) return null;
    return {
      snapshotDate,
      windowFrom: meta.windowFrom,
      windowTo: meta.windowTo,
      computedAt: meta.computedAt,
      settings: meta.settings,
      candidates: buildCandidates(rows, withoutRow),
      rowsByInspector: new Map(rows.map((r) => [r.inspectorId, r])),
    };
  }

  /** `platform_settings.updated_at` of `reliabilityIndex`, or `null`. */
  getSettingsUpdatedAt(): Promise<Date | null> {
    return this.repo.findReliabilitySettingsUpdatedAt();
  }

  /**
   * Current index per inspector (for F08). With `inspectorIds`, returns one entry
   * per requested id (`NOT_COMPUTED` when it has no row); without, every inspector
   * in the latest snapshot. The `position` is the platform-wide ranking in all cases.
   */
  async getCurrentIndexes(inspectorIds?: string[]): Promise<CurrentIndex[]> {
    const loaded = await this.loadLatest();
    if (!loaded) {
      return (inspectorIds ?? []).map((inspectorId) => ({
        inspectorId,
        score: null,
        status: 'NOT_COMPUTED',
        position: null,
        volume: 0,
        snapshotDate: null,
      }));
    }

    const { ranked } = rankSnapshots(loaded.candidates);
    const positionById = new Map(ranked.map((r) => [r.inspectorId, r.position]));
    const targetIds = inspectorIds ?? loaded.candidates.map((c) => c.inspectorId);

    return targetIds.map((inspectorId) => {
      const row = loaded.rowsByInspector.get(inspectorId);
      if (!row) {
        return {
          inspectorId,
          score: null,
          status: 'NOT_COMPUTED',
          position: null,
          volume: 0,
          snapshotDate: loaded.snapshotDate,
        };
      }
      return {
        inspectorId,
        score: row.score,
        status: row.status,
        position: positionById.get(inspectorId) ?? null,
        volume: row.volume,
        snapshotDate: loaded.snapshotDate,
      };
    });
  }

  /** The competition position + ranked count for one inspector (used by the detail use case). */
  positionFor(candidates: RankCandidate[], inspectorId: string): { position: number | null; rankedCount: number } {
    return positionOf(candidates, inspectorId);
  }
}
