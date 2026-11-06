import { isProjectedLate, zonedWallTimeToUtc } from '@properfy/shared';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { DueTenantGroup } from '../../../../shared/application/tenant-cron-tick';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { TenantEtaNotifier } from '../tenant-eta-notifier.service';
import {
  evaluateForPlan,
  createStopNotifier,
  findPlanStop,
  type EvaluateForPlanDeps,
} from '../services/evaluate-for-plan';

/**
 * 01.12-B — the morning arrival estimate. Runs per agency at `morningHour` via
 * TenantCronTick; aborts the whole group if `now` is at/after the cutoff
 * (`morningCutoffHour`), and re-checks the cutoff before each create so a long
 * batch or a pg-boss retry that crosses 09:00 stops sending (D3).
 */
export class SendMorningEtaNoticesUseCase {
  constructor(
    private readonly planReader: EvaluateForPlanDeps['planReader'],
    private readonly getFreshStop: EvaluateForPlanDeps['getFreshStop'],
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly notifier: TenantEtaNotifier,
    private readonly settingsReader: IPlatformSettingsReader,
    private readonly logger: Logger,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(group: DueTenantGroup): Promise<void> {
    const settings = await this.settingsReader.get('tenantEtaNotices');
    if (!settings.enabled) return;

    const startNow = this.clock.now();
    const cutoffTime = `${String(settings.morningCutoffHour).padStart(2, '0')}:00`;
    const cutoff = zonedWallTimeToUtc(group.todayCivil, cutoffTime, group.timezone);
    if (startNow.getTime() >= cutoff.getTime()) {
      this.logger.info(
        { timezone: group.timezone, tenantIds: group.tenantIds, localTime: cutoffTime },
        'tenant_eta.morning_skipped_after_cutoff',
      );
      return;
    }

    const dateObj = new Date(`${group.todayCivil}T00:00:00.000Z`);
    const scheduled = await this.appointmentRepo.findScheduledOnDate(dateObj, group.tenantIds);
    const inspectorIds = [
      ...new Set(
        scheduled
          .map((a) => a.appointment.inspectorId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    const tenantSet = new Set(group.tenantIds);

    let stops = 0;
    let created = 0;
    let skipped = 0;

    for (const inspectorId of inspectorIds) {
      const evaluation = await evaluateForPlan(
        { planReader: this.planReader, getFreshStop: this.getFreshStop },
        inspectorId,
        group.todayCivil,
        startNow,
      );
      if ('skip' in evaluation) {
        this.logger.info(
          { inspectorId, kind: 'MORNING', trigger: 'MORNING', reason: evaluation.skip },
          'tenant_eta.notice_skipped',
        );
        continue;
      }

      const notifyStop = createStopNotifier(
        { appointmentRepo: this.appointmentRepo, tenantRepo: this.tenantRepo, notifier: this.notifier, logger: this.logger },
        { snapshot: evaluation.snapshot, settings, planVersion: evaluation.planVersion, approximate: evaluation.approximate, now: startNow },
      );

      for (const projected of evaluation.projection) {
        const planStop = findPlanStop(evaluation.snapshot, projected.appointmentId);
        if (!planStop || !tenantSet.has(planStop.tenantId)) continue;
        stops += 1;

        if (this.clock.now().getTime() >= cutoff.getTime()) {
          this.skip(planStop.appointmentId, 'AFTER_CUTOFF');
          skipped += 1;
          continue;
        }
        if (projected.state !== 'PENDING') {
          this.skip(planStop.appointmentId, 'STARTED');
          skipped += 1;
          continue;
        }
        if (planStop.windowEndAt.getTime() <= startNow.getTime()) {
          this.skip(planStop.appointmentId, 'WINDOW_PASSED');
          skipped += 1;
          continue;
        }

        // A stop already projected late gets the DELAY copy, not a misleading
        // morning estimate; a DELAY already sent today means the band was
        // already announced, so no morning either.
        const alreadyDelayed = await this.notifier.alreadyNotified('DELAY', planStop);
        if (isProjectedLate(projected, settings.delayThresholdMinutes)) {
          if (alreadyDelayed) {
            skipped += 1;
            continue;
          }
          const r = await notifyStop('DELAY', 'MORNING', planStop, projected);
          created += r.created;
          if (r.created === 0) skipped += 1;
        } else {
          if (alreadyDelayed) {
            skipped += 1;
            continue;
          }
          const r = await notifyStop('MORNING', 'MORNING', planStop, projected);
          created += r.created;
          if (r.created === 0) skipped += 1;
        }
      }
    }

    this.logger.info({ stops, created, skipped }, 'tenant_eta.morning_completed');
  }

  private skip(appointmentId: string, reason: string): void {
    this.logger.info(
      { appointmentId, kind: 'MORNING', trigger: 'MORNING', reason },
      'tenant_eta.notice_skipped',
    );
  }
}
