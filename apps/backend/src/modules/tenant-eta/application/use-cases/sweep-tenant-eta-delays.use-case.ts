import {
  zonedWallTimeToUtc,
  PLATFORM_TIMEZONE,
  TENANT_ETA_DAILY_SMS_WARN_THRESHOLD,
} from '@properfy/shared';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { TenantEtaNotifier } from '../tenant-eta-notifier.service';
import type { ITenantEtaNoticeLog } from '../../domain/tenant-eta-notice-log';
import type { ITenantEtaPlanReader } from '../../domain/tenant-eta-plan.reader';
import { evaluateForPlan, createStopNotifier, type EvaluateForPlanDeps } from '../services/evaluate-for-plan';
import { evaluatePlanDelays } from '../services/evaluate-plan-delays';
import { evaluateEarlyChanges } from '../services/evaluate-early-changes';

/**
 * 01.12 — the 30-minute safety net. Re-projects every published plan whose day is
 * today (in the plan's timezone) with a not-started SCHEDULED stop, sends a DELAY
 * for any pending stop that has crossed its window + threshold and an EARLY_CHANGE
 * correction where the projection moved earlier. STALE plans are counted and
 * retried next round. Emits the daily-volume warn above the threshold (L-F06-11).
 */
export class SweepTenantEtaDelaysUseCase {
  constructor(
    private readonly planReader: ITenantEtaPlanReader,
    private readonly getFreshStop: EvaluateForPlanDeps['getFreshStop'],
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly notifier: TenantEtaNotifier,
    private readonly noticeLog: ITenantEtaNoticeLog,
    private readonly settingsReader: IPlatformSettingsReader,
    private readonly logger: Logger,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(): Promise<void> {
    const settings = await this.settingsReader.get('tenantEtaNotices');
    if (!settings.enabled) return;

    const now = this.clock.now();
    const start = Date.now();
    const candidates = await this.planReader.listSweepCandidates(now);

    let plans = 0;
    let evaluated = 0;
    let delayed = 0;
    let earlyChanged = 0;
    let created = 0;
    let skippedStale = 0;

    for (const candidate of candidates) {
      plans += 1;
      try {
        const evaluation = await evaluateForPlan(
          { planReader: this.planReader, getFreshStop: this.getFreshStop },
          candidate.inspectorId,
          candidate.planDate,
          now,
        );
        if ('skip' in evaluation) {
          if (evaluation.skip === 'PLAN_STALE') skippedStale += 1;
          continue;
        }
        evaluated += 1;

        const notifyStop = createStopNotifier(
          { appointmentRepo: this.appointmentRepo, tenantRepo: this.tenantRepo, notifier: this.notifier, logger: this.logger },
          { snapshot: evaluation.snapshot, settings, planVersion: evaluation.planVersion, approximate: evaluation.approximate, now },
        );

        // The notifier's per-stop BEFORE_MORNING_HOUR guard honours each stop's
        // agency morning hour; the sweep need not pre-filter by timezone.
        const delays = await evaluatePlanDelays({ evaluation, settings, trigger: 'SWEEP', notifier: this.notifier, notifyStop });
        delayed += delays.delayed;
        created += delays.created;

        const early = await evaluateEarlyChanges({ evaluation, now, noticeLog: this.noticeLog, notifyStop });
        earlyChanged += early.earlyChanged;
        created += early.created;
      } catch (err) {
        // Isolate one plan's failure so the rest of the sweep still runs.
        this.logger.error({ inspectorId: candidate.inspectorId, planDate: candidate.planDate, err }, 'tenant_eta.sweep_plan_failed');
      }
    }

    const platformMidnight = zonedWallTimeToUtc(
      civilDateInTimezone(now, PLATFORM_TIMEZONE),
      '00:00',
      PLATFORM_TIMEZONE,
    );
    const smsCreatedToday = await this.noticeLog.countSmsCreatedSince(platformMidnight);

    this.logger.info(
      { plans, evaluated, delayed, earlyChanged, created, skippedStale, smsCreatedToday, durationMs: Date.now() - start },
      'tenant_eta.sweep_completed',
    );
    if (smsCreatedToday > TENANT_ETA_DAILY_SMS_WARN_THRESHOLD) {
      this.logger.warn(
        { smsCreatedToday, threshold: TENANT_ETA_DAILY_SMS_WARN_THRESHOLD },
        'tenant_eta.daily_volume_high',
      );
    }
  }
}
