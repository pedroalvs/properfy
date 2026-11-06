import type { EtaPlanInput, EtaRealEvents } from '@properfy/shared';

/** Per-stop rental-tenant confirmation context (L-F06-02); outside the shared EtaPlanInput. */
export interface TenantEtaStopMeta {
  rentalTenantConfirmationStatus: 'PENDING' | 'CONFIRMED' | 'UNAVAILABLE' | 'NO_RESPONSE';
  keyRequired: boolean;
  requiresRentalTenantConfirmation: boolean;
}

export interface LoadedTenantEtaPlan {
  plan: EtaPlanInput;
  events: EtaRealEvents;
  stopMeta: Map<string, TenantEtaStopMeta>;
}

/** A plan found by inspector + date, with its live appointment ids in sequence. */
export interface TenantEtaPlanRef {
  dayPlanId: string;
  appointmentIds: string[];
}

/** A plan the delay sweep should re-evaluate today. */
export interface TenantEtaSweepCandidate {
  dayPlanId: string;
  inspectorId: string;
  planDate: string;
}

/**
 * Read side of the F06 arrival-notice prediction. Reads a whole inspector day
 * plan (stops of several agencies) only to compute times — the cross-tenant D9
 * exception; no HTTP route exposes the result, and TASK-F06-2 creates each
 * notification with the appointment's own tenant_id.
 */
export interface ITenantEtaPlanReader {
  /** Full plan + real events + per-stop confirmation meta, or null if the plan is gone. */
  loadPlan(dayPlanId: string): Promise<LoadedTenantEtaPlan | null>;
  /** The plan for an inspector on a civil date (plan tz) with its live appointments. */
  findPlanByInspectorDate(inspectorId: string, planDate: string): Promise<TenantEtaPlanRef | null>;
  /** Published plans of "today" (plan tz) with at least one not-started SCHEDULED stop. */
  listSweepCandidates(now: Date): Promise<TenantEtaSweepCandidate[]>;
}
