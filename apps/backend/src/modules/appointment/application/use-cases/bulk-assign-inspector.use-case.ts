import type { AuthContext, BulkActionResultItem } from '@properfy/shared';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { BulkEditAppointmentsUseCase } from './bulk-edit-appointments.use-case';
import { dayKeyInTz, mapBulkEditFailureToResult } from './bulk-action-shared';

const IDEMPOTENCY_SCOPE = 'bulk_assign_inspector';
const IDEMPOTENCY_TTL_HOURS = 36;

export interface BulkAssignInspectorInput {
  appointmentIds: string[];
  inspectorId: string;
  actor: AuthContext;
  actorTimezone?: string;
}

export interface BulkAssignInspectorOutput {
  results: BulkActionResultItem[];
}

/**
 * 025 §FR-441 — Bulk assign / reassign inspector from the map flow.
 *
 * Delegates per-item to `BulkEditAppointmentsUseCase` with a single-id
 * batch. That use case already owns the per-row guardrails (terminal
 * status block, inactive-inspector check, client-eligibility check)
 * and produces a `failed[]` envelope we translate to the standard
 * bulk-action result item.
 *
 * Why not `UpdateAppointmentUseCase`? It does not accept `inspectorId`
 * in its input — the inspector-assignment path lives in `BulkEditAppointments`
 * because of the per-row eligibility checks that aren't single-call shaped.
 * Delegating per-item keeps a single source of truth for those guardrails.
 */
export class BulkAssignInspectorUseCase {
  constructor(
    private readonly bulkEditAppointments: BulkEditAppointmentsUseCase,
    private readonly idempotency: IIdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: BulkAssignInspectorInput): Promise<BulkAssignInspectorOutput> {
    const dayKey = dayKeyInTz(this.clock(), input.actorTimezone);
    const results: BulkActionResultItem[] = [];

    for (const appointmentId of input.appointmentIds) {
      // Idempotency keys by (id, inspector) within the day — reassigning to
      // a different inspector still goes through; same target is a replay.
      const idemKey = `bulk_assign_inspector:${appointmentId}:${input.inspectorId}:${dayKey}`;
      const cached = await this.idempotency.getWithHash<BulkActionResultItem>(
        idemKey,
        IDEMPOTENCY_SCOPE,
      );
      if (cached) {
        results.push({ appointmentId, status: 'IDEMPOTENT_REPLAY' });
        continue;
      }

      try {
        const editResult = await this.bulkEditAppointments.execute({
          ids: [appointmentId],
          changes: { assignedInspectorId: input.inspectorId },
          actor: input.actor,
        });
        if (editResult.failed.length > 0) {
          results.push(mapBulkEditFailureToResult(editResult.failed[0]!));
          continue;
        }
        const result: BulkActionResultItem = { appointmentId, status: 'OK' };
        await this.idempotency.set(idemKey, IDEMPOTENCY_SCOPE, result, IDEMPOTENCY_TTL_HOURS);
        results.push(result);
      } catch (err) {
        // `BulkEditAppointmentsUseCase` may also throw (e.g. RBAC denial as
        // `ForbiddenError`). Map the same way the other bulk use cases do.
        const message = err instanceof Error ? err.message : 'Unknown error';
        const code = (err as { code?: string }).code ?? 'INTERNAL_ERROR';
        const statusCode = (err as { statusCode?: number }).statusCode;
        const status: BulkActionResultItem['status']
          = statusCode === 403 ? 'FORBIDDEN'
          : statusCode === 404 ? 'NOT_FOUND'
          : 'ERROR';
        results.push({ appointmentId, status, error: { code, message } });
      }
    }

    return { results };
  }
}
