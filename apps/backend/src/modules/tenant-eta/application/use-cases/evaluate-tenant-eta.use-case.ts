import { isProjectedLate, PLATFORM_TIMEZONE } from '@properfy/shared';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import { TenantEtaNotifier } from '../tenant-eta-notifier.service';
import type { ITenantEtaNoticeLog } from '../../domain/tenant-eta-notice-log';
import { wallTimeHHmm } from '../../domain/eta-band';
import {
  evaluateForPlan,
  createStopNotifier,
  findPlanStop,
  type EvaluateForPlanDeps,
  type PlanEvaluation,
} from '../services/evaluate-for-plan';
import { evaluatePlanDelays } from '../services/evaluate-plan-delays';
import { evaluateEarlyChanges } from '../services/evaluate-early-changes';

export interface EvaluateTenantEtaJob {
  trigger: 'FINISH' | 'CANT_DO' | 'LATE_NOTICE';
  appointmentId: string;
  tenantId: string;
  attempt: number;
  inspectorId?: string;
  occurredAt?: string;
  eventId?: string;
}

const MAX_ATTEMPTS = 3;
const STALE_RETRY_DELAY_MS = 30_000;

/**
 * 01.10 + 01.12 — handles the durable `tenant-eta.evaluate` job for all three
 * event triggers. FINISH/CANT_DO notify the next stop "on the way" (or DELAY if
 * late) and re-check the tail for delays/early-changes; LATE_NOTICE re-checks the
 * whole plan for delays. STALE re-enqueues up to 3 attempts, then gives up.
 */
export class EvaluateTenantEtaUseCase {
  constructor(
    private readonly planReader: EvaluateForPlanDeps['planReader'],
    private readonly getFreshStop: EvaluateForPlanDeps['getFreshStop'],
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly notifier: TenantEtaNotifier,
    private readonly noticeLog: ITenantEtaNoticeLog,
    private readonly settingsReader: IPlatformSettingsReader,
    private readonly jobQueue: IJobQueue,
    private readonly logger: Logger,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(job: EvaluateTenantEtaJob): Promise<void> {
    const settings = await this.settingsReader.get('tenantEtaNotices');
    if (!settings.enabled) return;

    const now = this.clock.now();
    const appt = await this.appointmentRepo.findById(job.appointmentId, job.tenantId);
    if (!appt) return;

    const tenant = await this.tenantRepo.findById(job.tenantId);
    if (!tenant) return;
    const tz = tenant.timezone ?? PLATFORM_TIMEZONE;

    const scheduledDate = appt.appointment.scheduledDate.toISOString().slice(0, 10);
    if (scheduledDate !== civilDateInTimezone(now, tz)) {
      this.skip(job, 'NOT_TODAY');
      return;
    }
    if (Number(wallTimeHHmm(now, tz).slice(0, 2)) < settings.morningHour) {
      this.skip(job, 'BEFORE_MORNING_HOUR');
      return;
    }

    const inspectorId = job.trigger === 'CANT_DO' ? job.inspectorId : appt.appointment.inspectorId;
    if (!inspectorId) {
      this.skip(job, 'NO_INSPECTOR');
      return;
    }

    const evaluation = await evaluateForPlan(
      { planReader: this.planReader, getFreshStop: this.getFreshStop },
      inspectorId,
      scheduledDate,
      now,
    );
    if ('skip' in evaluation) {
      if (evaluation.skip === 'PLAN_STALE') {
        await this.reenqueueOrGiveUp(job, now);
        return;
      }
      this.skip(job, evaluation.skip);
      return;
    }

    const notifyStop = createStopNotifier(
      { appointmentRepo: this.appointmentRepo, tenantRepo: this.tenantRepo, notifier: this.notifier, logger: this.logger },
      { snapshot: evaluation.snapshot, settings, planVersion: evaluation.planVersion, approximate: evaluation.approximate, now },
    );

    if (job.trigger === 'LATE_NOTICE') {
      // A late notice shifts every following stop — re-check all pending delays.
      await evaluatePlanDelays({ evaluation, settings, trigger: 'LATE_NOTICE', notifier: this.notifier, notifyStop });
      await evaluateEarlyChanges({ evaluation, now, noticeLog: this.noticeLog, notifyStop });
      this.logger.info({ trigger: job.trigger, appointmentId: job.appointmentId }, 'tenant_eta.evaluate_completed');
      return;
    }

    // FINISH / CANT_DO — the "on the way" to the next stop.
    if (job.trigger === 'CANT_DO' && evaluation.projection.some((p) => p.state === 'IN_PROGRESS')) {
      this.skip(job, 'INSPECTOR_BUSY');
      return;
    }

    const next = this.selectNextStop(job, evaluation);
    if (!next) {
      this.skip(job, 'NO_NEXT_STOP');
      this.logger.info({ trigger: job.trigger, appointmentId: job.appointmentId }, 'tenant_eta.evaluate_completed');
      return;
    }

    if (next.projected.state === 'PENDING') {
      const late = isProjectedLate(next.projected, settings.delayThresholdMinutes);
      const alreadyDelayed = late ? await this.notifier.alreadyNotified('DELAY', next.planStop) : false;
      // A late next stop with no DELAY today gets the DELAY copy (one message);
      // an already-delayed or on-time next stop gets ON_THE_WAY (D5).
      const kind = late && !alreadyDelayed ? 'DELAY' : 'ON_THE_WAY';
      await notifyStop(kind, job.trigger, next.planStop, next.projected);
    } else {
      this.skip(job, 'NEXT_STARTED');
    }

    // Re-check stops after the next one for delays and early changes.
    await evaluatePlanDelays({
      evaluation, settings, trigger: job.trigger, notifier: this.notifier, notifyStop,
      afterSequence: next.planStop.sequence,
    });
    await evaluateEarlyChanges({
      evaluation, now, noticeLog: this.noticeLog, notifyStop, afterSequence: next.planStop.sequence,
    });

    this.logger.info({ trigger: job.trigger, appointmentId: job.appointmentId }, 'tenant_eta.evaluate_completed');
  }

  /**
   * FINISH: the stop immediately after the finished one in sequence order.
   * CANT_DO: the first pending stop (the rejected one already left the plan).
   */
  private selectNextStop(job: EvaluateTenantEtaJob, evaluation: PlanEvaluation) {
    const { projection } = evaluation;
    const toStop = (appointmentId: string) => {
      const planStop = findPlanStop(evaluation.snapshot, appointmentId);
      const projected = projection.find((p) => p.appointmentId === appointmentId);
      return planStop && projected ? { planStop, projected } : null;
    };

    if (job.trigger === 'CANT_DO') {
      const firstPending = projection.find((p) => p.state === 'PENDING');
      return firstPending ? toStop(firstPending.appointmentId) : null;
    }

    const idx = projection.findIndex((p) => p.appointmentId === job.appointmentId);
    if (idx === -1) {
      const firstPending = projection.find((p) => p.state === 'PENDING');
      return firstPending ? toStop(firstPending.appointmentId) : null;
    }
    const next = projection[idx + 1];
    return next ? toStop(next.appointmentId) : null;
  }

  private async reenqueueOrGiveUp(job: EvaluateTenantEtaJob, now: Date): Promise<void> {
    if (job.attempt >= MAX_ATTEMPTS) {
      this.logger.info(
        { trigger: job.trigger, appointmentId: job.appointmentId, reason: 'PLAN_STALE' },
        'tenant_eta.evaluate_gave_up',
      );
      return;
    }
    const nextAttempt = job.attempt + 1;
    const keySuffix = job.eventId ?? job.occurredAt ?? '';
    await this.jobQueue.enqueue(
      'tenant-eta.evaluate',
      { ...job, attempt: nextAttempt },
      {
        startAfter: new Date(now.getTime() + STALE_RETRY_DELAY_MS),
        singletonKey: `tenant-eta:${job.trigger}:${job.appointmentId}:${keySuffix}:${nextAttempt}`,
        retryLimit: 2,
        retryBackoff: true,
        expireInMinutes: 5,
      },
    );
  }

  private skip(job: EvaluateTenantEtaJob, reason: string): void {
    this.logger.info(
      { trigger: job.trigger, appointmentId: job.appointmentId, reason },
      'tenant_eta.notice_skipped',
    );
  }
}
