import type { AuthContext, BulkActionResultItem } from '@properfy/shared';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { ExecuteStatusTransitionUseCase } from './execute-status-transition.use-case';
import { mapErrorToResult, REPLAY_WINDOW_TTL_HOURS } from './bulk-action-shared';

const IDEMPOTENCY_SCOPE = 'bulk_cancel';

export interface BulkCancelAppointmentsInput {
  appointmentIds: string[];
  reason: string;
  /** Applied per appointment; the handler still requires each tenant to have confirmed. */
  notifyRentalTenant?: boolean;
  actor: AuthContext;
}

export interface BulkCancelAppointmentsOutput {
  results: BulkActionResultItem[];
}

/**
 * 025 §FR-411 — Bulk cancel from the map flow.
 *
 * Thin sequential loop around `ExecuteStatusTransitionUseCase` with
 * per-item idempotency keyed by `appointmentId` for a short replay
 * window (`REPLAY_WINDOW_TTL_HOURS`). The
 * underlying use case owns RBAC, state-machine validation, audit logs
 * and side effects; the bulk wrapper adds no transition logic of its
 * own (Constitution §State Machine Sovereignty).
 *
 * Sequential (not Promise.all) by design — same rationale as
 * `bulk-resend-reminder.use-case.ts`: keeps the per-item error envelope
 * clean and avoids fan-out pressure on the DB and audit pipeline.
 */
export class BulkCancelAppointmentsUseCase {
  constructor(
    private readonly executeStatusTransition: ExecuteStatusTransitionUseCase,
    private readonly idempotency: IIdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: BulkCancelAppointmentsInput): Promise<BulkCancelAppointmentsOutput> {
    const results: BulkActionResultItem[] = [];

    for (const appointmentId of input.appointmentIds) {
      const idemKey = `bulk_cancel:${appointmentId}`;
      const cached = await this.idempotency.getWithHash<BulkActionResultItem>(
        idemKey,
        IDEMPOTENCY_SCOPE,
      );
      if (cached) {
        results.push({ appointmentId, status: 'IDEMPOTENT_REPLAY' });
        continue;
      }

      try {
        await this.executeStatusTransition.execute({
          appointmentId,
          targetStatus: 'CANCELLED',
          reason: input.reason,
          notifyRentalTenant: input.notifyRentalTenant,
          actor: input.actor,
        });
        const result: BulkActionResultItem = { appointmentId, status: 'OK' };
        await this.idempotency.set(idemKey, IDEMPOTENCY_SCOPE, result, REPLAY_WINDOW_TTL_HOURS);
        results.push(result);
      } catch (err) {
        results.push(mapErrorToResult(appointmentId, err));
      }
    }

    return { results };
  }
}
