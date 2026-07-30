import { isAppointmentOverdue } from '@properfy/shared';
import { SYSTEM_ACTOR } from '../../../../shared/domain/constants';
import { formatDate, startOfPlatformToday } from '../../../../shared/domain/timezone-date';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { ExecuteStatusTransitionUseCase } from './execute-status-transition.use-case';
import type { Logger } from '../../../../shared/infrastructure/logger';

const CANCELLATION_REASON = 'Appointment date passed without execution';

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
 * Cancels appointments still in an active status after their scheduled date has
 * passed. `DRAFT` is deliberately untouched: an unreleased appointment is not
 * late, and operators use `DRAFT` as the repair state.
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
    const cutoff = startOfPlatformToday();
    const appointments = await this.appointmentRepo.findOverdueActive(cutoff, this.batchLimit);

    if (appointments.length === 0) {
      this.logger.info({ cutoff }, 'No overdue appointments to cancel');
      return { cancelledCount: 0, failedCount: 0, skippedCount: 0, batchCapped: false };
    }

    let cancelledCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const candidate of appointments) {
      try {
        // Re-read before acting. An operator can reschedule or finish an appointment
        // after the query selected it, and the transition use case re-validates status
        // but not the date — so acting on the stale snapshot could cancel a
        // now-future appointment as EXPIRED. `isAppointmentOverdue` is the same
        // predicate the query and the UI badge use.
        const fresh = await this.appointmentRepo.findById(candidate.id, candidate.tenantId);
        if (!fresh) {
          skippedCount++;
          continue;
        }
        const appointment = fresh.appointment;
        if (!isAppointmentOverdue(appointment.status, appointment.scheduledDate)) {
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
          // Already-past dates: notifying the rental tenant now is pure noise, and
          // the first run over a historical backlog would notify all of it at once.
          suppressNotifications: true,
          // Keyed on the appointment AND the date that expired. Re-runs on the same
          // day are no-ops (the cache lives 24h), but an appointment that was
          // reopened, re-dated and went stale again is a genuinely different
          // expiry — an id-only key would silently skip it.
          idempotencyKey: `expire_overdue:${appointment.id}:${formatDate(appointment.scheduledDate)}`,
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
