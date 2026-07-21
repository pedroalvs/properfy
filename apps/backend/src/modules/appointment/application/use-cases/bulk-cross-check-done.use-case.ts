import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { PerformCrossCheckUseCase } from './perform-cross-check.use-case';

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
 * Sequential (not Promise.all) is intentional: per-item domain errors are
 * captured into `failed[]` so the batch never aborts. A non-DONE appointment
 * surfaces as `APPOINTMENT_DONE_CROSS_CHECK_INVALID_STATUS` — the "skipped with
 * a warning" behaviour shown in the UI.
 */
export class BulkCrossCheckDoneUseCase {
  constructor(
    private readonly performCrossCheck: PerformCrossCheckUseCase,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: BulkCrossCheckDoneInput): Promise<BulkCrossCheckDoneResult> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'appointment.cross_check',
      entityType: 'Appointment',
    });

    const updated: string[] = [];
    const failed: Array<{ id: string; code: string; message: string }> = [];

    for (const appointmentId of input.ids) {
      try {
        await this.performCrossCheck.execute({ appointmentId, actor: input.actor });
        updated.push(appointmentId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const code = (err as { code?: string })?.code ?? 'INTERNAL_ERROR';
        failed.push({ id: appointmentId, code, message });
      }
    }

    return { updated: updated.length, failed };
  }
}
