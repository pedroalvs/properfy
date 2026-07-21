import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { PerformCrossCheckUseCase } from './perform-cross-check.use-case';
import { dayKeyInTz } from './bulk-action-shared';

const IDEMPOTENCY_SCOPE = 'bulk_cross_check';
const IDEMPOTENCY_TTL_HOURS = 36;

export interface BulkCrossCheckDoneInput {
  ids: string[];
  actor: AuthContext;
}

export interface BulkCrossCheckDoneResult {
  updated: number;
  failed: Array<{ id: string; code: string; message: string }>;
}

/**
 * Bulk "Reviewed" action — cross-checks a batch of DONE appointments
 * (field `doneCheckedByUserId`).
 *
 * RBAC is asserted once up front (AM / OP only) so a forbidden actor gets a
 * single 403 rather than a per-item failure. Each id is then delegated to the
 * single-appointment `PerformCrossCheckUseCase`, reusing its full guard chain
 * (status must be DONE, not already checked, no self-approval, inspection
 * evidence present) plus the financial-entry side effect — no duplication.
 *
 * Per-item idempotency keyed by `(appointmentId, dayInActorTz)` mirrors the
 * sibling bulk wrappers (`bulk-cancel`, `bulk-status-transition`, …). Because
 * the delegated cross-check produces a financial-entry side effect, the key
 * guards a same-day retry / concurrent double-submit from re-firing it: a
 * cached hit is counted as `updated` without re-invoking the inner use case.
 * Only successful cross-checks are cached, so genuine failures (non-DONE,
 * evidence-incomplete, …) are always retried.
 *
 * Sequential (not Promise.all) is intentional: per-item errors are captured
 * into `failed[]` so the batch never aborts. A non-DONE appointment surfaces
 * as `APPOINTMENT_DONE_CROSS_CHECK_INVALID_STATUS` — the "skipped with a
 * warning" behaviour shown in the UI.
 */
export class BulkCrossCheckDoneUseCase {
  constructor(
    private readonly performCrossCheck: PerformCrossCheckUseCase,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotency: IIdempotencyService,
    private readonly logger: Logger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: BulkCrossCheckDoneInput): Promise<BulkCrossCheckDoneResult> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'appointment.cross_check',
      entityType: 'Appointment',
    });

    const dayKey = dayKeyInTz(this.clock());
    let updated = 0;
    const failed: Array<{ id: string; code: string; message: string }> = [];

    for (const appointmentId of input.ids) {
      const idemKey = `bulk_cross_check:${appointmentId}:${dayKey}`;
      const cached = await this.idempotency.getWithHash<{ ok: true }>(idemKey, IDEMPOTENCY_SCOPE);
      if (cached) {
        // Already cross-checked in this window — treat the replay as a success
        // without re-firing the financial side effect.
        updated += 1;
        continue;
      }

      try {
        await this.performCrossCheck.execute({ appointmentId, actor: input.actor });
        await this.idempotency.set(idemKey, IDEMPOTENCY_SCOPE, { ok: true }, IDEMPOTENCY_TTL_HOURS);
        updated += 1;
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code) {
          // Known domain error — its code/message are safe to surface.
          const message = err instanceof Error ? err.message : 'Unable to cross-check appointment';
          failed.push({ id: appointmentId, code, message });
        } else {
          // Unexpected error — log the raw detail server-side, return a generic
          // message so internals don't leak into the API response.
          this.logger.error({ err, appointmentId }, 'Unexpected error during bulk cross-check');
          failed.push({
            id: appointmentId,
            code: 'INTERNAL_ERROR',
            message: 'Unexpected error while processing this appointment',
          });
        }
      }
    }

    return { updated, failed };
  }
}
