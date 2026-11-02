/**
 * Port for reading inspector check-in density (F09-1).
 *
 * PRIVACY INVARIANT — read before changing this file:
 *
 *   This port returns ONLY aggregated cell indices and counts plus valid/invalid
 *   totals. There is deliberately NO method that returns an individual coordinate
 *   or a raw execution row. Raw inspector check-in coordinates are the inspector's
 *   position and must never leave Postgres. The aggregation (grouping by the
 *   ~100 m grid cell) therefore happens inside the SQL adapter, not in the
 *   application layer.
 *
 *   Do NOT add a `findRows`/`findMany` method and do NOT "simplify" an
 *   implementation into fetch-then-aggregate-in-memory: either would pull raw
 *   coordinates into Node and defeat the guarantee by construction.
 */

export interface ExecutionDensityFilters {
  /** Inclusive start instant of the window. */
  from: Date;
  /** Exclusive end instant of the window (`[from, toExclusive)`). */
  toExclusive: Date;
  /** Agency scope via `appointments.tenant_id`; `undefined` = no tenant predicate (AM/OP). */
  tenantId?: string;
  /** Restrict to the check-in inspector (`inspection_executions.inspector_id`); AM/OP only. */
  inspectorId?: string;
  /** Cells per degree (`EXECUTION_DENSITY_GRID_SCALE`). */
  gridScale: number;
  /** Minimum check-ins per cell to return (`HAVING`); 1 for AM/OP, 3 for agency actors. */
  minCellCount: number;
  /** Maximum cells to return; the adapter fetches `limit + 1` so the use case can detect truncation. */
  limit: number;
}

export interface ExecutionDensityRow {
  latIndex: number;
  lngIndex: number;
  /** Check-ins in the cell; always `>= minCellCount`. */
  count: number;
}

export interface ExecutionDensityTotals {
  /** Executions in the window with a usable coordinate. */
  valid: number;
  /** Executions in the window with an unusable coordinate ((0,0) or out of range). */
  invalid: number;
}

export interface ExecutionDensityReader {
  aggregate(
    filters: ExecutionDensityFilters,
  ): Promise<{ rows: ExecutionDensityRow[]; totals: ExecutionDensityTotals }>;
}
