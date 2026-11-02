import {
  EXECUTION_DENSITY_GRID_SCALE,
  MIN_CELL_COUNT_CL,
  MIN_CELL_COUNT_GLOBAL,
} from '@properfy/shared';
import { PLATFORM_TIMEZONE, nextCivilDay, parseDateInTimezone } from '../../../shared/domain/timezone-date';

/**
 * Pure grid math for the execution-density endpoint (F09-1).
 *
 * The cell index is `FLOOR(coordinate * EXECUTION_DENSITY_GRID_SCALE)`. The SQL
 * reader computes it in `numeric` (`FLOOR(start_latitude * 1000)`); `toCellIndex`
 * is the exact TypeScript mirror used to seed and assert the DB tests, so the two
 * can never drift. The point we expose is always the cell CENTER, never the mean
 * of the real points — a single-check-in cell's mean would be the inspector's
 * exact coordinate.
 */

export interface GridCell {
  latIndex: number;
  lngIndex: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** The center of a grid cell, rounded to 4 decimals (grid granularity is 0.0005). */
export function cellCenter(cell: GridCell): LatLng {
  return {
    lat: Number(((cell.latIndex + 0.5) / EXECUTION_DENSITY_GRID_SCALE).toFixed(4)),
    lng: Number(((cell.lngIndex + 0.5) / EXECUTION_DENSITY_GRID_SCALE).toFixed(4)),
  };
}

/**
 * `FLOOR(value * EXECUTION_DENSITY_GRID_SCALE)` computed on the decimal STRING of
 * a `Decimal(10,7)`, with integer arithmetic only — never `Math.floor(value * 1000)`
 * on a float, which can land a grid-line point in the neighbouring cell. Exactly
 * mirrors Postgres `FLOOR(numeric * int)`, including at boundaries and in negatives.
 *
 * The signature takes a `string` on purpose: callers must pass a `Decimal`'s string
 * form (e.g. `new Prisma.Decimal(x).toFixed(7)`), not a lossy JS number.
 */
export function toCellIndex(value: string): number {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [intPart, fracPart = ''] = unsigned.split('.');

  // Scale factor is 1000 → shift the decimal point three places.
  const SHIFT = 3;
  const shiftedFrac = (fracPart + '000').slice(0, SHIFT);
  // The magnitude is floor(|value| * 1000) toward zero: integer digits + first 3 fractional digits.
  const magnitude = Number(`${intPart}${shiftedFrac}`);
  // Any digit beyond the shifted three means |value| * 1000 had a fractional remainder.
  const hasRemainder = /[1-9]/.test(fracPart.slice(SHIFT));

  if (!negative) {
    // Truncation toward zero equals floor for non-negative values.
    return magnitude;
  }
  // floor(-(magnitude + remainder)) = -magnitude when remainder is 0, else -(magnitude + 1).
  return hasRemainder ? -(magnitude + 1) : -magnitude;
}

/**
 * Converts an inclusive civil-date period in the platform timezone to a half-open
 * instant interval `[from, toExclusive)`. Correct on the 23 h / 25 h DST days in
 * Sydney because `toExclusive` is the next civil midnight, not a fixed +24 h.
 */
export function periodToInstants(
  fromDate: string,
  toDate: string,
): { from: Date; toExclusive: Date } {
  return {
    from: parseDateInTimezone(fromDate, PLATFORM_TIMEZONE),
    toExclusive: parseDateInTimezone(nextCivilDay(toDate), PLATFORM_TIMEZONE),
  };
}

/**
 * The k-anonymity floor for a read, decided by SCOPE TYPE: a tenant-pinned actor
 * (a resolved tenant id) gets `MIN_CELL_COUNT_CL`, a cross-tenant actor
 * `MIN_CELL_COUNT_GLOBAL`. Keying on the pinned tenant rather than a role list
 * means a future pinned role inherits k = 3 automatically.
 */
export function minCellCountFor(pinnedTenantId: string | undefined): number {
  return pinnedTenantId === undefined ? MIN_CELL_COUNT_GLOBAL : MIN_CELL_COUNT_CL;
}
