import type { GeneratePortalTokenUseCase, AuthContext } from '../../../rental-tenant-portal/application/use-cases/generate-portal-token.use-case';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { BulkResendReminderResult } from '@properfy/shared';

const IDEMPOTENCY_SCOPE = 'bulk_resend_reminder';
const IDEMPOTENCY_TTL_HOURS = 36;
const ERROR_CODE = 'DISPATCH_FAILED';

export interface BulkResendReminderInput {
  appointmentIds: string[];
  actor: AuthContext;
  /**
   * IANA timezone string used to compute the "day key" portion of the
   * idempotency key. Per 023 §FR-243, the operator's mental model is "I
   * already sent the reminder today", so the day key uses the actor's
   * timezone (not UTC). When omitted, falls back to the server timezone via
   * the runtime's `Intl.DateTimeFormat`, which is the safest default for
   * single-region deployments.
   */
  actorTimezone?: string;
}

export interface BulkResendReminderResultDto {
  results: BulkResendReminderResult[];
}

/**
 * Computes a YYYY-MM-DD day key in the requested timezone using the runtime
 * `Intl.DateTimeFormat`. Avoids pulling a TZ library into the backend and
 * matches the operator's "today in my local time" intuition (023 §FR-243).
 */
function dayKeyInTz(now: Date, timeZone?: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(now);
  } catch {
    // Invalid TZ → fall through to UTC so a misconfigured caller does not
    // collapse the idempotency key across days.
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}

/**
 * Bulk re-send portal reminders (023 §FR-241..245).
 *
 * Sequential `for…of` loop:
 *   1. Per-appointment idempotency keyed by `(appointmentId, dayInActorTz)` —
 *      a same-day retry returns `IDEMPOTENT_REPLAY` without re-dispatching.
 *   2. Delegates to `GeneratePortalTokenUseCase`. Its `dispatched: false,
 *      reason: 'NO_PRIMARY_CONTACT'` return surfaces as `NO_PRIMARY_CONTACT`.
 *   3. Per-item exceptions are captured as `ERROR` so the batch never aborts.
 *   4. Successful and "no primary" outcomes are stored in the idempotency
 *      table so a same-day retry is a no-op.
 *
 * Sequential (not Promise.all) is intentional: avoids hammering downstream
 * notification providers and keeps the per-item error envelope clean.
 */
export class BulkResendReminderUseCase {
  constructor(
    private readonly generatePortalToken: GeneratePortalTokenUseCase,
    private readonly idempotency: IIdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: BulkResendReminderInput): Promise<BulkResendReminderResultDto> {
    const dayKey = dayKeyInTz(this.clock(), input.actorTimezone);
    const results: BulkResendReminderResult[] = [];

    for (const apptId of input.appointmentIds) {
      const idemKey = `bulk_resend:${apptId}:${dayKey}`;
      const cached = await this.idempotency.getWithHash<BulkResendReminderResult>(
        idemKey,
        IDEMPOTENCY_SCOPE,
      );
      if (cached) {
        results.push({ appointmentId: apptId, status: 'IDEMPOTENT_REPLAY' });
        continue;
      }

      try {
        const dispatch = await this.generatePortalToken.execute({
          appointmentId: apptId,
          actor: input.actor,
        });
        const status = dispatch.dispatched === false && dispatch.reason === 'NO_PRIMARY_CONTACT'
          ? 'NO_PRIMARY_CONTACT'
          : 'SENT';
        const result: BulkResendReminderResult = { appointmentId: apptId, status };
        await this.idempotency.set(idemKey, IDEMPOTENCY_SCOPE, result, IDEMPOTENCY_TTL_HOURS);
        results.push(result);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Dispatch failed';
        results.push({
          appointmentId: apptId,
          status: 'ERROR',
          error: { code: ERROR_CODE, message },
        });
      }
    }

    return { results };
  }
}
