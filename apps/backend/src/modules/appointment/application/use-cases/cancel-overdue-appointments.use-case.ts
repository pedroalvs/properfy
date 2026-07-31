import {
  isAppointmentOverdue,
  OVERDUE_AGE_DAYS,
  OVERDUE_AUTO_CANCEL_STATUSES,
  PLATFORM_TIMEZONE,
} from '@properfy/shared';
import { SYSTEM_ACTOR } from '../../../../shared/domain/constants';
import {
  civilDateInTimezone,
  startOfOverdueAgeCutoff,
} from '../../../../shared/domain/timezone-date';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { ExecuteStatusTransitionUseCase } from './execute-status-transition.use-case';
import type { Logger } from '../../../../shared/infrastructure/logger';

const CANCELLATION_REASON = `Not executed within ${OVERDUE_AGE_DAYS} days of creation`;

/**
 * How many appointments one run will cancel. A backlog larger than this drains
 * over consecutive runs rather than holding a single job open for a long time.
 */
export const DEFAULT_BATCH_LIMIT = 500;

export interface CancelOverdueAppointmentsOutput {
  cancelledCount: number;
  failedCount: number;
  /** Selected by the query but no longer eligible when re-read. */
  skippedCount: number;
  /** True when the run filled its batch, so more may remain. */
  batchCapped: boolean;
}

/**
 * Cancels appointments still in an active status more than `OVERDUE_AGE_DAYS` after
 * they were created. `DRAFT` is deliberately untouched: operators use `DRAFT` as the
 * repair state, so a stale `DRAFT` carries the overdue badge but is never cancelled.
 *
 * The rule is age-of-record, not "the scheduled date passed" — so re-dating an
 * appointment into the future does NOT rescue it from this sweep.
 *
 * Transitions go through the sovereign transition use case rather than writing to
 * the repository directly, so each cancellation is audited, idempotent and emits
 * the domain event that the empty-service-group cleanup listens for.
 */
export class CancelOverdueAppointmentsUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly transitionUseCase: ExecuteStatusTransitionUseCase,
    private readonly logger: Logger,
    private readonly batchLimit: number = DEFAULT_BATCH_LIMIT,
  ) {}

  async execute(): Promise<CancelOverdueAppointmentsOutput> {
    const cutoff = startOfOverdueAgeCutoff();
    const appointments = await this.appointmentRepo.findOverdueForAutoCancel(
      cutoff,
      this.batchLimit,
    );

    if (appointments.length === 0) {
      this.logger.info({ cutoff }, 'No overdue appointments to cancel');
      return { cancelledCount: 0, failedCount: 0, skippedCount: 0, batchCapped: false };
    }

    let cancelledCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const candidate of appointments) {
      try {
        // Re-read before acting. An operator can finish, cancel or pull an appointment
        // back to DRAFT after the query selected it. `created_at` is immutable, so it
        // is the STATUS that can have moved out from under the batch.
        const fresh = await this.appointmentRepo.findById(candidate.id, candidate.tenantId);
        if (!fresh) {
          skippedCount++;
          continue;
        }
        const appointment = fresh.appointment;
        // Both checks are needed. `isAppointmentOverdue` is the shared predicate the
        // list filter and the UI badge use, and it reports a stale DRAFT as overdue —
        // so the narrower auto-cancel status list is what keeps DRAFT safe here.
        const cancellable =
          (OVERDUE_AUTO_CANCEL_STATUSES as readonly string[]).includes(appointment.status) &&
          isAppointmentOverdue({
            status: appointment.status,
            createdAt: appointment.createdAt,
          });
        if (!cancellable) {
          skippedCount++;
          this.logger.info(
            { appointmentId: appointment.id, status: appointment.status },
            'Overdue candidate changed before it could be cancelled — skipping',
          );
          continue;
        }

        await this.transitionUseCase.execute({
          appointmentId: appointment.id,
          targetStatus: 'CANCELLED',
          reason: CANCELLATION_REASON,
          cancellationReasonCode: 'EXPIRED',
          // `notifyRentalTenant` is deliberately not passed: telling the rental tenant
          // about a job that never happened is noise, and the first run over a
          // historical backlog would notify all of it at once. The agency IS told — it
          // ordered the work and needs to know it never happened.
          // Keyed on the appointment AND the run's civil date. Re-runs on the same day
          // are no-ops (the cache lives 24h), while an appointment that was reopened
          // and went stale again still expires on a later day. Keying on `createdAt`
          // instead would be permanently constant, since it never changes.
          idempotencyKey: `expire_overdue:${appointment.id}:${civilDateInTimezone(new Date(), PLATFORM_TIMEZONE)}`,
          actor: { ...SYSTEM_ACTOR, tenantId: appointment.tenantId },
        });
        cancelledCount++;
      } catch (err) {
        // One unprocessable appointment must not abort the sweep.
        failedCount++;
        this.logger.error(
          { appointmentId: candidate.id, status: candidate.status, err },
          'Failed to cancel overdue appointment',
        );
      }
    }

    const batchCapped = appointments.length >= this.batchLimit;
    if (batchCapped) {
      this.logger.warn(
        { batchLimit: this.batchLimit, cancelledCount },
        'Overdue cancellation hit its batch limit — more appointments remain for the next run',
      );
    }

    this.logger.info(
      { cancelledCount, failedCount, skippedCount, batchCapped },
      'Overdue appointment cancellation completed',
    );

    return { cancelledCount, failedCount, skippedCount, batchCapped };
  }
}
