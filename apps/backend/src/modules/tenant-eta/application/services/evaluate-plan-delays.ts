import { isProjectedLate, type TenantEtaNoticesSetting } from '@properfy/shared';
import type { TenantEtaNotifier, TenantEtaTrigger } from '../tenant-eta-notifier.service';
import { findPlanStop, type NotifyStopFn, type PlanEvaluation } from './evaluate-for-plan';

export interface EvaluatePlanDelaysArgs {
  evaluation: PlanEvaluation;
  settings: TenantEtaNoticesSetting;
  trigger: TenantEtaTrigger;
  notifier: TenantEtaNotifier;
  notifyStop: NotifyStopFn;
  /** Only stops after this sequence (FINISH re-checks the tail past the next stop). */
  afterSequence?: number;
}

export interface EvaluatePlanDelaysResult {
  /** Stops for which a DELAY notice was actually created. */
  delayed: number;
  created: number;
}

/**
 * Shared by the morning job, the evaluate job and the sweep: for every pending
 * stop whose projection crosses the booked window + threshold and that has not
 * had a DELAY today, send one "running late" notice. One per stop per day is
 * enforced by `alreadyNotified` + the notifier's deterministic id; the notifier
 * also drops a projection that falls on the next local day (NEXT_DAY).
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
    if (!isProjectedLate(projected, args.settings.delayThresholdMinutes)) continue;
    if (await args.notifier.alreadyNotified('DELAY', planStop)) continue;
    const result = await args.notifyStop('DELAY', args.trigger, planStop, projected);
    if (result.created > 0) delayed += 1;
    created += result.created;
  }
  return { delayed, created };
}
