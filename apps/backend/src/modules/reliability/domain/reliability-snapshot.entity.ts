import type { ReliabilityMetricKey, ReliabilityMetricResult, ReliabilityScoreStatus } from '@properfy/shared';
import type { VolumeReference } from './volume-reference';

/** What triggered a snapshot run. Only `SCHEDULED` purges old rows (L-F07-12). */
export type SnapshotTrigger = 'SCHEDULED' | 'SETTINGS_CHANGED' | 'BACKFILL';

/**
 * The tuning used for a day's snapshot, frozen into `settings_json`. Identical
 * across all rows of one `snapshot_date` (the volume reference is computed once
 * per run). The detail API reads `weights` from here to annotate each metric.
 */
export interface SnapshotSettings {
  weights: Record<ReliabilityMetricKey, number>;
  minimumVolume: number;
  minimumRatings: number;
  toleranceMinutes: number;
  volumeReference: VolumeReference;
}

/** A row to write for the day (stored `status` is never `NOT_COMPUTED`). */
export interface NewReliabilitySnapshotRow {
  inspectorId: string;
  snapshotDate: string;
  windowFrom: string;
  windowTo: string;
  windowDays: number;
  status: ReliabilityScoreStatus;
  score: number | null;
  volume: number;
  completedCount: number;
  metrics: ReliabilityMetricResult[];
  settings: SnapshotSettings;
  trigger: SnapshotTrigger;
  computedAt: Date;
}

/** A stored row read back, joined with its inspector's name and active flag. */
export interface StoredReliabilitySnapshotRow {
  inspectorId: string;
  inspectorName: string;
  /** `inspectors.status === 'ACTIVE'` AND not soft-deleted, at read time (not frozen in the row). */
  inspectorActive: boolean;
  snapshotDate: string;
  windowFrom: string;
  windowTo: string;
  windowDays: number;
  status: ReliabilityScoreStatus;
  score: number | null;
  volume: number;
  completedCount: number;
  metrics: ReliabilityMetricResult[];
  settings: SnapshotSettings;
  computedAt: Date;
}
