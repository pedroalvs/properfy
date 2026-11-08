import { InspectorLevel } from '../enums/inspector-program';

/** Level thresholds from the `inspectorProgram` platform setting (D3, configurable). */
export interface InspectorLevelThresholds {
  silverMinScore: number;
  goldMinScore: number;
}

/**
 * Derive an inspector's level from their current reliability score (D3).
 *
 * A `null` score (not scored, or no index yet) is `null` level. There is no
 * table and no hysteresis — the level is a pure function of the current score.
 */
export function resolveInspectorLevel(
  score: number | null,
  thresholds: InspectorLevelThresholds,
): InspectorLevel | null {
  if (score === null) return null;
  if (score >= thresholds.goldMinScore) return InspectorLevel.GOLD;
  if (score >= thresholds.silverMinScore) return InspectorLevel.SILVER;
  return InspectorLevel.BRONZE;
}

const LEVEL_RANK: Record<InspectorLevel, number> = {
  BRONZE: 0,
  SILVER: 1,
  GOLD: 2,
};

/**
 * True when `level` meets or exceeds `minLevel` (early-access gate, TASK-F08-2).
 * A `null` level never qualifies.
 */
export function isEarlyAccessLevel(level: InspectorLevel | null, minLevel: InspectorLevel): boolean {
  if (level === null) return false;
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}

/**
 * The minimum score a level requires — used by the TASK-F08-2 eligibility SQL to
 * translate a `minLevel` setting into a score threshold.
 */
export function minScoreForLevel(level: InspectorLevel, thresholds: InspectorLevelThresholds): number {
  switch (level) {
    case InspectorLevel.BRONZE:
      return 0;
    case InspectorLevel.SILVER:
      return thresholds.silverMinScore;
    case InspectorLevel.GOLD:
      return thresholds.goldMinScore;
  }
}
