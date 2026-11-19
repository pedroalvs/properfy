import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  ExecutionDensityFilters,
  ExecutionDensityReader,
  ExecutionDensityRow,
  ExecutionDensityTotals,
} from '../domain/execution-density.reader';

/**
 * Aggregates inspector check-in density inside Postgres (F09-1).
 *
 * Two read-only queries run in parallel:
 *  - the cell query groups by `FLOOR(coordinate * gridScale)` and applies the
 *    k-anonymity floor via `HAVING`;
 *  - the totals query counts every in-window execution, splitting valid vs
 *    invalid coordinates with a `FILTER`.
 *
 * The cell index uses `* ${gridScale}::int` (integer scaling in `numeric`), never
 * `/ 0.001` (float division binds `float8` and misplaces grid-line points). Raw
 * coordinates never leave the database: the only columns selected are the cell
 * indices and the counts.
 */
export class PrismaExecutionDensityReader implements ExecutionDensityReader {
  constructor(private readonly prisma: PrismaClient) {}

  async aggregate(
    filters: ExecutionDensityFilters,
  ): Promise<{ rows: ExecutionDensityRow[]; totals: ExecutionDensityTotals }> {
    const { from, toExclusive, tenantId, inspectorId, gridScale, minCellCount, limit } = filters;

    const tenantFilter = tenantId ? Prisma.sql`AND a.tenant_id = ${tenantId}` : Prisma.empty;
    const inspectorFilter = inspectorId
      ? Prisma.sql`AND e.inspector_id = ${inspectorId}`
      : Prisma.empty;

    // A coordinate is usable when it is in range and not the (0,0) sentinel that
    // legacy/buggy clients wrote. The columns are NOT NULL, so there is no null case.
    const validCoord = Prisma.sql`e.start_latitude BETWEEN -90 AND 90 AND e.start_longitude BETWEEN -180 AND 180 AND NOT (e.start_latitude = 0 AND e.start_longitude = 0)`;

    const rowsPromise = this.prisma.$queryRaw<ExecutionDensityRow[]>(Prisma.sql`
      SELECT FLOOR(e.start_latitude  * ${gridScale}::int)::int AS "latIndex",
             FLOOR(e.start_longitude * ${gridScale}::int)::int AS "lngIndex",
             COUNT(*)::int AS "count"
      FROM inspection_executions e
      JOIN appointments a ON a.id = e.appointment_id
      WHERE e.started_at >= ${from} AND e.started_at < ${toExclusive}
        AND e.abandoned_at IS NULL
        AND a.deleted_at IS NULL
        ${tenantFilter}
        ${inspectorFilter}
        AND ${validCoord}
      GROUP BY 1, 2
      HAVING COUNT(*) >= ${minCellCount}::int
      ORDER BY 3 DESC, 1, 2
      LIMIT ${limit + 1}::int
    `);

    const totalsPromise = this.prisma.$queryRaw<Array<{ valid: number; invalid: number }>>(
      Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE ${validCoord})::int AS "valid",
               COUNT(*) FILTER (WHERE NOT (${validCoord}))::int AS "invalid"
        FROM inspection_executions e
        JOIN appointments a ON a.id = e.appointment_id
        WHERE e.started_at >= ${from} AND e.started_at < ${toExclusive}
          AND e.abandoned_at IS NULL
          AND a.deleted_at IS NULL
          ${tenantFilter}
          ${inspectorFilter}
      `,
    );

    const [rows, totalsRows] = await Promise.all([rowsPromise, totalsPromise]);
    const totals: ExecutionDensityTotals = {
      valid: totalsRows[0]?.valid ?? 0,
      invalid: totalsRows[0]?.invalid ?? 0,
    };
    return { rows, totals };
  }
}
