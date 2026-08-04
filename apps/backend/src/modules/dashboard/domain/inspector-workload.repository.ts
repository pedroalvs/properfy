import type { InspectorWorkloadResponse } from '@properfy/shared';

/**
 * One workload read, for the week beginning `weekStart` (always a Monday).
 *
 * There is deliberately no clock and no tenant here. Every window the repository
 * needs — the three weeks of the comparison strip, the two months of the
 * completion figures — derives from `weekStart`, so the repository stays a pure
 * function of its input. Resolving "which week is now" is the use case's job,
 * where the clock can be injected.
 *
 * The read is cross-tenant by design: inspectors have no `tenant_id`, so an
 * agency-scoped workload would only ever show that agency's slice of an
 * inspector's week and make the capacity thresholds meaningless. The route is
 * restricted to AM/OP for exactly that reason.
 */
export interface InspectorWorkloadQuery {
  /** Monday of the week to report on, as a civil date. */
  weekStart: string;
}

export interface InspectorWorkloadRepository {
  getWorkload(query: InspectorWorkloadQuery): Promise<InspectorWorkloadResponse>;
}
