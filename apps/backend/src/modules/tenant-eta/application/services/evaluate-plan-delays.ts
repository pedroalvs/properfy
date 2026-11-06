import { isProjectedLate, type TenantEtaNoticesSetting } from '@properfy/shared';
import type { TenantEtaNotifier, TenantEtaTrigger } from '../tenant-eta-notifier.service';
import { findPlanStop, type NotifyStopFn, type PlanEvaluation } from './evaluate-for-plan';

export interface EvaluatePlanDelaysArgs {
  evaluation: PlanEvaluation;
  settings: TenantEtaNoticesSetting;
  trigger: TenantEtaTrigger;
  notifier: TenantEtaNotifier;
  notifyStop: NotifyStopFn;
  /** Restrict to these agencies (morning group); omit to cover every stop. */
  tenantFilter?: (tenantId: string) => boolean;
  /** Only stops after this sequence (FINISH re-checks the tail past the next stop). */
  afterSequence?: number;
}

export interface EvaluatePlanDelaysResult {
  delayed: number;
  created: number;
}

/**
 * Shared by the morning job, the evaluate job and the sweep: for every pending
 * stop whose projection crosses the booked window + threshold and that has not
 * had a DELAY today, send one "running late" notice (one per stop per day is
 * enforced by the notifier's deterministic id + `alreadyNotified`).
 */
export async function evaluatePlanDelays(
  args: EvaluatePlanDelaysArgs,
): Promise<EvaluatePlanDelaysResult> {
  let delayed = 0;
  let created = 0;
  for (const projected of args.evaluation.projection) {
    if (projected.state !== 'PENDING') continue;
    const planStop = findPlanStop(args.evaluation.snapshot, projected.appointmentId);
    if (!planStop) continue;
    if (args.afterSequence !== undefined && planStop.sequence <= args.afterSequence) continue;
    if (args.tenantFilter && !args.tenantFilter(planStop.tenantId)) continue;
    if (!isProjectedLate(projected, args.settings.delayThresholdMinutes)) continue;
    if (await args.notifier.alreadyNotified('DELAY', planStop)) continue;
    const result = await args.notifyStop('DELAY', args.trigger, planStop, projected);
    delayed += 1;
    created += result.created;
  }
  return { delayed, created };
}
