import { z } from 'zod';
import { addCivilDays } from '../utils/local-date';
import { civilDateSchema } from './civil-date';

/**
 * Contract for `GET /v1/map/execution-density` (feature F09-1, client scope D.1–D.4).
 *
 * The endpoint returns the density of inspector check-ins aggregated into a
 * fixed ~100 m grid, scoped per agency through the appointment join. The grid
 * aggregation happens inside Postgres; the response only ever carries cell
 * CENTERS and counts — never an individual inspector coordinate.
 */

/** Cells per degree. One cell ≈ 111 m (N-S) × 92 m (E-W) in Sydney ("~100 m"). */
export const EXECUTION_DENSITY_GRID_SCALE = 1000;

/** Grid cell size in degrees, `1 / EXECUTION_DENSITY_GRID_SCALE`. Echoed as `gridSizeDegrees`. */
export const EXECUTION_DENSITY_GRID_DEGREES = 1 / EXECUTION_DENSITY_GRID_SCALE; // 0.001

/**
 * Longest period the endpoint will aggregate, inclusive. A bound is required,
 * not cosmetic: for AM/OP the read is unscoped. Mirrors `MAX_ANALYTICS_PERIOD_DAYS`.
 */
export const MAX_EXECUTION_DENSITY_PERIOD_DAYS = 366;

/** Hard cap on returned cells; the payload stays well under ~150 KB and the heatmap fluid. */
export const MAX_EXECUTION_DENSITY_CELLS = 5000;

/**
 * k-anonymity floor for tenant-pinned (agency) actors: a cell must hold at least
 * this many check-ins to be shown, so a single isolated visit cannot be located.
 */
export const MIN_CELL_COUNT_CL = 3;

/** AM/OP see every non-empty cell. */
export const MIN_CELL_COUNT_GLOBAL = 1;

/**
 * The only look-back windows an agency actor may request, in inclusive days.
 *
 * A per-query `HAVING count >= 3` does not survive a window-difference attack:
 * two agency queries differing by one day would isolate that day's single
 * check-in. Locking agency actors to fixed presets ending "today" removes
 * arbitrary window differencing. AM/OP keep free periods within the 366-day cap.
 */
export const EXECUTION_DENSITY_PRESET_DAYS = [7, 30, 90] as const;

const periodDays = (fromDate: string, toDate: string): number =>
  (Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / 86_400_000 + 1;

export const executionDensityQuerySchema = z
  .object({
    fromDate: civilDateSchema,
    toDate: civilDateSchema,
    /** AM/OP: restricts to the agency. Agency actors: ignored (their JWT tenant is used). */
    tenantId: z.string().uuid().optional(),
    /** AM/OP: restricts to the check-in inspector. Agency actors: rejected with 403 in the use case. */
    inspectorId: z.string().uuid().optional(),
  })
  .refine((q) => q.toDate >= q.fromDate, {
    message: 'toDate must be >= fromDate',
    path: ['toDate'],
  })
  .refine((q) => periodDays(q.fromDate, q.toDate) <= MAX_EXECUTION_DENSITY_PERIOD_DAYS, {
    message: `Period must not exceed ${MAX_EXECUTION_DENSITY_PERIOD_DAYS} days`,
    path: ['toDate'],
  });

export type ExecutionDensityQuery = z.infer<typeof executionDensityQuerySchema>;

/** One grid cell: the CENTER of a ~100 m square and the number of check-ins inside it. */
export const executionDensityCellSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  count: z.number().int().min(1),
});

export type ExecutionDensityCell = z.infer<typeof executionDensityCellSchema>;

export const executionDensityResponseSchema = z.object({
  /** Echo of the requested period. */
  fromDate: civilDateSchema,
  toDate: civilDateSchema,
  /** Always `EXECUTION_DENSITY_GRID_DEGREES`; carried so the client never re-derives the grid. */
  gridSizeDegrees: z.literal(EXECUTION_DENSITY_GRID_DEGREES),
  /** 1 for AM/OP, 3 for agency actors — cells below this count were hidden. */
  minCellCount: z.number().int().min(1),
  /** Ordered by count desc, then latIndex, lngIndex. */
  cells: z.array(executionDensityCellSchema),
  /** `cells.length`. */
  cellCount: z.number().int().nonnegative(),
  /** Valid-coordinate executions in the window, including those in hidden or truncated cells. */
  totalExecutions: z.number().int().nonnegative(),
  /** Executions in the window whose coordinate was unusable ((0,0) or out of range). */
  excludedWithoutCoordinates: z.number().int().nonnegative(),
  /** True when more than `MAX_EXECUTION_DENSITY_CELLS` cells existed and `cells` was capped. */
  truncated: z.boolean(),
});

export type ExecutionDensityResponse = z.infer<typeof executionDensityResponseSchema>;

/**
 * True when `range` is exactly one of the `EXECUTION_DENSITY_PRESET_DAYS` look-back
 * windows ending on `today` (a YYYY-MM-DD civil date in the platform timezone).
 *
 * Pure civil-date math so backend and web agree on what counts as a preset.
 */
export function isExecutionDensityPreset(
  range: { fromDate: string; toDate: string },
  today: string,
): boolean {
  if (range.toDate !== today) return false;
  return EXECUTION_DENSITY_PRESET_DAYS.some(
    (days) => range.fromDate === addCivilDays(today, -(days - 1)),
  );
}
