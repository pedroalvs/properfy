import type { AuthContext, ExecutionDensityQuery, ExecutionDensityResponse } from '@properfy/shared';
import {
  EXECUTION_DENSITY_GRID_DEGREES,
  EXECUTION_DENSITY_GRID_SCALE,
  EXECUTION_DENSITY_PRESET_DAYS,
  MAX_EXECUTION_DENSITY_CELLS,
  isExecutionDensityPreset,
} from '@properfy/shared';
import {
  APPOINTMENT_LIST_ROLES,
  resolveAppointmentListTenantScope,
} from '../../../appointment/application/appointment-list-scope';
import { type Clock, SystemClock } from '../../../../shared/domain/clock';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import { requireTenantScope } from '../../../../shared/domain/require-tenant-scope';
import { PLATFORM_TIMEZONE, civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import {
  cellCenter,
  minCellCountFor,
  periodToInstants,
} from '../../domain/execution-density-grid';
import type { ExecutionDensityReader } from '../../domain/execution-density.reader';

/**
 * Roles allowed to read activity density. Reuses the appointments-list roles so
 * the two never drift; `map.execution_density` in the shared role matrix mirrors
 * this exactly (asserted by U22).
 */
export const EXECUTION_DENSITY_ROLES = APPOINTMENT_LIST_ROLES;

export interface GetExecutionDensityInput {
  actor: AuthContext;
  query: ExecutionDensityQuery;
}

/**
 * Reads inspector check-in density aggregated into a ~100 m grid (F09-1).
 *
 * Scope is the appointment's agency (`inspection_executions` has no `tenant_id`).
 * AM/OP read platform-wide; agency actors are pinned to their JWT tenant, may not
 * filter by inspector, and may only request the fixed look-back presets ending
 * today (so differencing windows cannot isolate a single day's check-in). No raw
 * coordinate is ever returned — the reader aggregates inside Postgres and this
 * use case maps each cell to its center.
 */
export class GetExecutionDensityUseCase {
  constructor(
    private readonly reader: ExecutionDensityReader,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute({ actor, query }: GetExecutionDensityInput): Promise<ExecutionDensityResponse> {
    // 1. Role gate BEFORE the scope helper, which throws a 500-shaped Error (not a
    //    403) for INSP/TNT on a tenant-dispatching path.
    if (!(EXECUTION_DENSITY_ROLES as readonly string[]).includes(actor.role)) {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'Insufficient permissions to view activity density.',
      );
    }

    // 2. Tenant scope. `pinned` is defined only for agency (tenant-pinned) actors;
    //    it throws TENANT_SCOPE_REQUIRED for a pinned actor without a tenant.
    const pinned = requireTenantScope(actor, 'map.execution_density');

    if (pinned !== undefined && query.inspectorId !== undefined) {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'Filtering activity density by inspector is not available for agency accounts.',
      );
    }

    // 2a. Agency actors may only request the fixed presets ending today (Sydney),
    //     so window differencing cannot defeat the per-cell k-anonymity.
    if (
      pinned !== undefined &&
      !isExecutionDensityPreset(query, civilDateInTimezone(this.clock.now(), PLATFORM_TIMEZONE))
    ) {
      throw new ValidationError('Agency accounts can only view the last 7, 30 or 90 days.', {
        reason: 'PERIOD_NOT_A_PRESET',
        allowedDays: [...EXECUTION_DENSITY_PRESET_DAYS],
      });
    }

    // 3. Resolve the agency predicate (CL ignores a requested tenantId; AM/OP honor it).
    const tenantId = resolveAppointmentListTenantScope(actor, query.tenantId);

    // 4. Civil-date period → half-open instant interval in the platform timezone.
    const { from, toExclusive } = periodToInstants(query.fromDate, query.toDate);

    // 5. k by scope type, so a future pinned role inherits k = 3 automatically.
    const minCellCount = minCellCountFor(pinned);

    const { rows, totals } = await this.reader.aggregate({
      from,
      toExclusive,
      tenantId,
      inspectorId: pinned !== undefined ? undefined : query.inspectorId,
      gridScale: EXECUTION_DENSITY_GRID_SCALE,
      minCellCount,
      limit: MAX_EXECUTION_DENSITY_CELLS,
    });

    // 6. Re-filter below k (defense in depth), detect truncation, map to cell centers.
    const visible = rows.filter((row) => row.count >= minCellCount);
    const truncated = visible.length > MAX_EXECUTION_DENSITY_CELLS;
    const cells = visible.slice(0, MAX_EXECUTION_DENSITY_CELLS).map((row) => ({
      ...cellCenter({ latIndex: row.latIndex, lngIndex: row.lngIndex }),
      count: row.count,
    }));

    return {
      fromDate: query.fromDate,
      toDate: query.toDate,
      gridSizeDegrees: EXECUTION_DENSITY_GRID_DEGREES,
      minCellCount,
      cells,
      cellCount: cells.length,
      totalExecutions: totals.valid,
      excludedWithoutCoordinates: totals.invalid,
      truncated,
    };
  }
}
