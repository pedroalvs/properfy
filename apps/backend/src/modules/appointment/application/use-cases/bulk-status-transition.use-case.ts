import type { AppointmentStatus, AuthContext, BulkActionResultItem } from '@properfy/shared';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { ExecuteStatusTransitionUseCase } from './execute-status-transition.use-case';
import { mapErrorToResult, REPLAY_WINDOW_TTL_HOURS } from './bulk-action-shared';

const IDEMPOTENCY_SCOPE = 'bulk_status_transition';

export interface BulkStatusTransitionInput {
  appointmentIds: string[];
  targetStatus: AppointmentStatus;
  reason?: string;
  actor: AuthContext;
}

export interface BulkStatusTransitionOutput {
  results: BulkActionResultItem[];
}

/**
 * 025 §FR-431 — Bulk status transition from the map flow.
 *
 * Generic wrapper around `ExecuteStatusTransitionUseCase` for the
 * transitions exposed in the bulk modal (release / reopen / reject).
 * The state machine inside the underlying use case is the sole arbiter
 * of which transitions are legal — this wrapper has no transition
 * knowledge of its own and surfaces every domain failure as a typed
 * per-item status.
 */
export class BulkStatusTransitionUseCase {
  constructor(
    private readonly executeStatusTransition: ExecuteStatusTransitionUseCase,
    private readonly idempotency: IIdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: BulkStatusTransitionInput): Promise<BulkStatusTransitionOutput> {
    const results: BulkActionResultItem[] = [];

    for (const appointmentId of input.appointmentIds) {
      // Keyed by (id, target) only — the replay window is the TTL alone, so
      // the same transition can be re-applied once the window lapses.
      const idemKey = `bulk_status_transition:${appointmentId}:${input.targetStatus}`;
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
          targetStatus: input.targetStatus,
          reason: input.reason,
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
