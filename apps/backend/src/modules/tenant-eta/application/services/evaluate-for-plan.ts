import {
  projectStopEta,
  type ProjectedStop,
  type EtaPlanStop,
  type TenantEtaNoticesSetting,
} from '@properfy/shared';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { AppointmentWithRelations } from '../../../appointment/domain/appointment.repository';
import type { TenantEntity } from '../../../tenant/domain/tenant.entity';
import type { FreshDayPlanStop } from '../../../day-plan/application/use-cases/get-fresh-stop-for-appointment.use-case';
import type {
  ITenantEtaPlanReader,
  LoadedTenantEtaPlan,
} from '../../domain/tenant-eta-plan.reader';
import { computeEtaBand } from '../../domain/eta-band';
import type { TenantEtaKind } from '../../domain/tenant-eta.constants';
import {
  TenantEtaNotifier,
  type TenantEtaTrigger,
  type TenantEtaNotifyResult,
} from '../tenant-eta-notifier.service';

export type PlanEvaluationSkip = 'NO_PLAN' | 'PLAN_STALE';

export interface PlanEvaluation {
  snapshot: LoadedTenantEtaPlan;
  projection: ProjectedStop[];
  planVersion: number;
  approximate: boolean;
}

/** Minimal shape of the day-plan fresh-stop use case (for testability). */
export interface FreshStopResolver {
  execute(input: { appointmentId: string; now?: Date }): Promise<FreshDayPlanStop | null>;
}

export interface EvaluateForPlanDeps {
  planReader: ITenantEtaPlanReader;
  getFreshStop: FreshStopResolver;
}

/**
 * The common seed-that-is-in-plan flow (task Algoritmo §"Fluxo comum"). Picks a
 * seed appointment that is still in the plan (so an appointment that left the
 * plan between the two reads does not skip the whole inspector), detects STALE
 * (do not notify), reconciles a plan-version race once, and projects the stops.
 */
export async function evaluateForPlan(
  deps: EvaluateForPlanDeps,
  inspectorId: string,
  planDate: string,
  now: Date,
): Promise<PlanEvaluation | { skip: PlanEvaluationSkip }> {
  const ref = await deps.planReader.findPlanByInspectorDate(inspectorId, planDate);
  if (!ref) return { skip: 'NO_PLAN' };

  const seed = await resolveSeed(deps, ref, now);
  if (seed === 'STALE') return { skip: 'PLAN_STALE' };
  if (seed === null) return { skip: 'NO_PLAN' };

  // Always load THIS inspector's plan for THIS date — never the seed's
  // self-reported dayPlanId (which `resolveSeed` already pinned to `ref`), so a
  // reassigned appointment can never pull in another plan.
  let snapshot = await deps.planReader.loadPlan(ref.dayPlanId);
  if (!snapshot) return { skip: 'NO_PLAN' };
  if (snapshot.plan.planDate !== planDate) return { skip: 'NO_PLAN' };

  // A plan-version mismatch means another compute wrote between the fresh read
  // and loadPlan (task 2b). Re-validate freshness once: if the seed is now STALE,
  // do not notify; otherwise proceed with the newest snapshot.
  if (snapshot.plan.planVersion !== seed.planVersion) {
    const refresh = await deps.getFreshStop.execute({ appointmentId: seed.appointmentId, now });
    if (refresh === null) return { skip: 'NO_PLAN' };
    if (refresh.status === 'STALE') return { skip: 'PLAN_STALE' };
    if (refresh.dayPlanId !== ref.dayPlanId) return { skip: 'NO_PLAN' };
    const reread = await deps.planReader.loadPlan(ref.dayPlanId);
    if (!reread || reread.plan.planDate !== planDate) return { skip: 'NO_PLAN' };
    snapshot = reread;
  }

  const projection = projectStopEta(snapshot.plan, snapshot.events, now);
  return {
    snapshot,
    projection,
    planVersion: snapshot.plan.planVersion,
    approximate: snapshot.plan.approximate,
  };
}

/**
 * Picks a seed appointment that is FRESH and still belongs to THIS plan
 * (`ref.dayPlanId`). Returns `'STALE'` (do not notify) as soon as a seed is
 * stale, `null` when no appointment is a valid seed for this plan.
 */
async function resolveSeed(
  deps: EvaluateForPlanDeps,
  ref: { dayPlanId: string; appointmentIds: string[] },
  now: Date,
): Promise<{ planVersion: number; appointmentId: string } | 'STALE' | null> {
  for (const appointmentId of ref.appointmentIds) {
    const fresh: FreshDayPlanStop | null = await deps.getFreshStop.execute({ appointmentId, now });
    if (fresh === null) continue; // appointment left the plan between reads — try the next seed
    if (fresh.status === 'STALE') return 'STALE';
    if (fresh.dayPlanId !== ref.dayPlanId) continue; // reassigned to another plan — not a seed for this one
    return { planVersion: fresh.planVersion, appointmentId };
  }
  return null;
}

export interface StopNotifierDeps {
  appointmentRepo: {
    findById(id: string, tenantId: string | null): Promise<AppointmentWithRelations | null>;
  };
  tenantRepo: { findById(id: string): Promise<TenantEntity | null> };
  notifier: TenantEtaNotifier;
  logger: Logger;
}

export interface StopNotifierContext {
  snapshot: LoadedTenantEtaPlan;
  settings: TenantEtaNoticesSetting;
  planVersion: number;
  approximate: boolean;
  now: Date;
}

export type NotifyStopFn = (
  kind: TenantEtaKind,
  trigger: TenantEtaTrigger,
  planStop: EtaPlanStop,
  projected: ProjectedStop,
) => Promise<TenantEtaNotifyResult>;

/**
 * Builds a per-execution notifier that loads the appointment + tenant on demand
 * (tenant cached across stops), computes the band, and calls the shared
 * notifier. Returns a zero result (and a warn) when the appointment/tenant can
 * no longer be loaded — a rare race, not a suppression reason.
 */
export function createStopNotifier(deps: StopNotifierDeps, ctx: StopNotifierContext): NotifyStopFn {
  const tenantCache = new Map<string, TenantEntity | null>();
  const zero: TenantEtaNotifyResult = { created: 0, duplicates: 0 };

  return async (kind, trigger, planStop, projected) => {
    if (!projected.projectedStartAt) return zero;

    const stopMeta = ctx.snapshot.stopMeta.get(planStop.appointmentId);
    if (!stopMeta) return zero;

    const appointmentWithRelations = await deps.appointmentRepo.findById(
      planStop.appointmentId,
      planStop.tenantId,
    );
    if (!appointmentWithRelations) {
      deps.logger.warn(
        { appointmentId: planStop.appointmentId },
        'tenant_eta.stop_unavailable',
      );
      return zero;
    }

    let tenant = tenantCache.get(planStop.tenantId);
    if (tenant === undefined) {
      tenant = await deps.tenantRepo.findById(planStop.tenantId);
      tenantCache.set(planStop.tenantId, tenant);
    }
    if (!tenant) {
      deps.logger.warn({ tenantId: planStop.tenantId }, 'tenant_eta.stop_unavailable');
      return zero;
    }

    const band = computeEtaBand(projected.projectedStartAt, projected, ctx.now);
    return deps.notifier.notify({
      kind,
      trigger,
      planStop,
      projected,
      stopMeta,
      band,
      appointmentWithRelations,
      tenant,
      settings: ctx.settings,
      planVersion: ctx.planVersion,
      approximate: ctx.approximate,
      now: ctx.now,
    });
  };
}

/** Look up the plan stop (identity + windows + serviceStartAt) for a projected stop. */
export function findPlanStop(
  snapshot: LoadedTenantEtaPlan,
  appointmentId: string,
): EtaPlanStop | undefined {
  return snapshot.plan.stops.find((s) => s.appointmentId === appointmentId);
}
