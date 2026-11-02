import { PLATFORM_TIMEZONE } from '@properfy/shared';
import type { Logger } from '../shared/infrastructure/logger';
import type { ICronJobRunRepository, TenantCronTick } from '../shared/application/tenant-cron-tick';
import type { PublishDayPlansUseCase } from '../modules/day-plan/application/use-cases/publish-day-plans.use-case';
import { withJobMetrics } from './with-job-metrics';

export const DAY_PLAN_PUBLISH_JOB = 'day-plan.publish';
const T1_JOB = 'appointment.reject-unconfirmed';
const PUBLISH_CRON = '30 * * * *';
const BUDGET_MS = 25 * 60_000;
const EXPIRE_IN_MINUTES = 30;
const CONTINUATION_START_AFTER_SECONDS = 120;

/** The subset of the pg-boss queue this worker drives. */
export interface DayPlanPublishBoss {
  schedule(name: string, cron: string, data: Record<string, unknown>, options: Record<string, unknown>): Promise<unknown>;
  work(name: string, options: Record<string, unknown>, handler: (job: { id: string; data: Record<string, unknown> }) => Promise<void>): Promise<unknown>;
  send(name: string, data: Record<string, unknown>, options: Record<string, unknown>): Promise<unknown>;
  unschedule(name: string): Promise<unknown>;
}

export interface DayPlanPublishWorkerDeps {
  tenantCronTick: Pick<TenantCronTick, 'runDue'>;
  cronJobRunRepo: Pick<ICronJobRunRepository, 'hasClaim' | 'releaseClaims'>;
  publishDayPlans: Pick<PublishDayPlansUseCase, 'execute'>;
  logger: Logger;
}

/**
 * Register the singleton 19:30 day-plan publish job (contract 00.A2). The hourly
 * `:30` Sydney tick fires `runDue(..., 19, gate)`: the gate keeps only tenants whose
 * T-1 (`appointment.reject-unconfirmed`) already ran and releases the rest for the
 * next tick. The use case then recomputes the due set from the surviving claims and
 * publishes sequentially within a budget; `continuation` re-enqueues the same
 * singleton job with `attempt + 1`. `DAY_PLAN_PUBLISH_ENABLED=false` unschedules it.
 * `TenantCronTick` is unchanged — only its read-only `hasClaim` is consulted here.
 *
 * Returns whether the worker was registered (false when the kill switch is off).
 */
export async function registerDayPlanPublishWorker(
  boss: DayPlanPublishBoss,
  deps: DayPlanPublishWorkerDeps,
): Promise<boolean> {
  if (process.env.DAY_PLAN_PUBLISH_ENABLED === 'false') {
    await boss.unschedule(DAY_PLAN_PUBLISH_JOB);
    deps.logger.info({}, 'day_plan.publish_worker.disabled');
    return false;
  }

  await boss.schedule(DAY_PLAN_PUBLISH_JOB, PUBLISH_CRON, {}, {
    tz: PLATFORM_TIMEZONE,
    singletonKey: DAY_PLAN_PUBLISH_JOB,
    expireInMinutes: EXPIRE_IN_MINUTES,
  });

  await boss.work(
    DAY_PLAN_PUBLISH_JOB,
    { teamSize: 1, teamConcurrency: 1 },
    withJobMetrics(DAY_PLAN_PUBLISH_JOB, async (job) => {
      const attempt = (job.data?.attempt as number | undefined) ?? 1;

      // Gate: claim the agencies at hour ≥ 19, then release those whose T-1 has not
      // run so they are retried on the next hourly tick (one agency only publishes
      // after its own T-1 ran). TenantCronTick is untouched.
      await deps.tenantCronTick.runDue(DAY_PLAN_PUBLISH_JOB, 19, async (group) => {
        const withoutT1: string[] = [];
        for (const tenantId of group.tenantIds) {
          if (!(await deps.cronJobRunRepo.hasClaim(T1_JOB, tenantId, group.todayCivil))) {
            withoutT1.push(tenantId);
          }
        }
        if (withoutT1.length > 0) {
          await deps.cronJobRunRepo.releaseClaims(DAY_PLAN_PUBLISH_JOB, withoutT1, group.todayCivil);
        }
      });

      const result = await deps.publishDayPlans.execute({ attempt, budgetMs: BUDGET_MS });

      if (result.continuation) {
        await boss.send(DAY_PLAN_PUBLISH_JOB, { attempt: attempt + 1 }, {
          singletonKey: DAY_PLAN_PUBLISH_JOB,
          startAfter: CONTINUATION_START_AFTER_SECONDS,
          expireInMinutes: EXPIRE_IN_MINUTES,
        });
      }
    }),
  );

  return true;
}
