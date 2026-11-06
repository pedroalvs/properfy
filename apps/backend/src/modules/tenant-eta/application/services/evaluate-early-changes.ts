import { zonedWallTimeToUtc, TENANT_ETA_EARLY_CHANGE_MINUTES } from '@properfy/shared';
import type { ITenantEtaNoticeLog } from '../../domain/tenant-eta-notice-log';
import { findPlanStop, type NotifyStopFn, type PlanEvaluation } from './evaluate-for-plan';

export interface EvaluateEarlyChangesArgs {
  evaluation: PlanEvaluation;
  now: Date;
  noticeLog: ITenantEtaNoticeLog;
  notifyStop: NotifyStopFn;
  tenantFilter?: (tenantId: string) => boolean;
  afterSequence?: number;
}

export interface EvaluateEarlyChangesResult {
  earlyChanged: number;
  created: number;
}

const MILLIS_PER_MINUTE = 60_000;

/**
 * L-F06-05: a pending stop that received a MORNING notice today and whose
 * projection has moved ≥ 30 minutes earlier than the morning band gets ONE
 * "on the way" correction (reusing the ON_THE_WAY id, so a stop never gets two).
 * The ≤ 60-minute lead and the dedupe are enforced by the notifier.
 */
export async function evaluateEarlyChanges(
  args: EvaluateEarlyChangesArgs,
): Promise<EvaluateEarlyChangesResult> {
  const candidates = args.evaluation.projection
    .filter((p) => p.state === 'PENDING' && p.projectedStartAt !== null)
    .map((projected) => ({ projected, planStop: findPlanStop(args.evaluation.snapshot, projected.appointmentId) }))
    .filter((c) => {
      if (!c.planStop) return false;
      if (args.afterSequence !== undefined && c.planStop.sequence <= args.afterSequence) return false;
      if (args.tenantFilter && !args.tenantFilter(c.planStop.tenantId)) return false;
      return true;
    });

  if (candidates.length === 0) return { earlyChanged: 0, created: 0 };

  const sinceByAppointment = new Map(
    candidates.map((c) => [
      c.planStop!.appointmentId,
      zonedWallTimeToUtc(c.planStop!.scheduledDate, '00:00', c.planStop!.windowTimezone),
    ]),
  );
  const morningBands = await args.noticeLog.findMorningBands(
    candidates.map((c) => c.planStop!.appointmentId),
    sinceByAppointment,
  );

  let earlyChanged = 0;
  let created = 0;
  for (const { projected, planStop } of candidates) {
    const bandFrom = morningBands.get(planStop!.appointmentId);
    if (!bandFrom) continue; // no morning notice today → never an early change
    const earlyThreshold = bandFrom.getTime() - TENANT_ETA_EARLY_CHANGE_MINUTES * MILLIS_PER_MINUTE;
    if (projected.projectedStartAt!.getTime() < earlyThreshold) {
      const result = await args.notifyStop('ON_THE_WAY', 'EARLY_CHANGE', planStop!, projected);
      earlyChanged += 1;
      created += result.created;
    }
  }
  return { earlyChanged, created };
}
