import type {
  DayPlanStatus,
  DayPlanComputeTrigger,
  DayPlanOriginSource,
  RoutingProvider,
  RouteWeights,
  InspectorBaseAddress,
} from '@properfy/shared';
import type {
  DayPlanGeometry,
  StoredRoutingMatrix,
} from '../application/services/plan-route.service';
import type { DayPlanRecord, DayPlanLegTravel } from './day-plan.entity';

/** A stop to persist within a computed plan (1-based `sequence`). */
export interface SaveDayPlanStop {
  appointmentId: string;
  sequence: number;
  eta: Date | null;
  serviceStartAt: Date | null;
  serviceEndAt: Date | null;
  publishedEta: Date | null;
  publishedServiceStartAt: Date | null;
  publishedPredictedAt: Date | null;
  publishedApproximate: boolean | null;
  travelS: number;
  distanceM: number | null;
  waitS: number;
  lateS: number;
  windowStartAt: Date;
  windowEndAt: Date;
  windowTimezone: string;
  durationMinutes: number;
  lat: number | null;
  lng: number | null;
  manual: boolean;
  executed: boolean;
  approximate: boolean;
  missingCoordinates: boolean;
}

/** Full computed plan to insert (expectedVersion null) or CAS-update (expectedVersion set). */
export interface SaveDayPlanInput {
  id: string | null;
  expectedVersion: number | null;
  inspectorId: string;
  planDate: string;
  timezone: string;
  status: DayPlanStatus;
  inputFingerprint: string;
  publishedAt: Date | null;
  notifiedAt: Date | null;
  computedAt: Date;
  computedByUserId: string | null;
  lastTrigger: DayPlanComputeTrigger;
  originSource: DayPlanOriginSource;
  originLat: number | null;
  originLng: number | null;
  originOverride: InspectorBaseAddress | null;
  originOverrideLat: number | null;
  originOverrideLng: number | null;
  originOverrideSetAt: Date | null;
  departureAt: Date | null;
  finishEta: Date | null;
  totalDriveS: number;
  totalWaitS: number;
  totalServiceS: number;
  totalLateS: number;
  totalDistanceM: number | null;
  feasible: boolean;
  manualOrder: boolean;
  suggestedOrder: string[];
  weights: RouteWeights;
  optimizerMethod: string;
  routingProvider: RoutingProvider;
  matrixProfile: string | null;
  approximate: boolean;
  approximateReason: string | null;
  routeGeometry: DayPlanGeometry | null;
  routingMatrix: StoredRoutingMatrix | null;
  legTravel: DayPlanLegTravel[] | null;
  stops: SaveDayPlanStop[];
}

/** One sample for the "Route ETA accuracy" metric: |check-in − published start| in minutes. */
export interface EtaAccuracySample {
  errorMinutes: number;
}

export interface IDayPlanRepository {
  /** The plan with its stops, re-joined to live appointments (status IN SCHEDULED/DONE, L-F04-04). */
  findByInspectorAndDate(inspectorId: string, planDate: string): Promise<DayPlanRecord | null>;

  /**
   * Insert (expectedVersion null) or CAS-update (`UPDATE … WHERE id AND version =
   * expectedVersion`, DELETE/INSERT stops in one transaction, `version + 1`,
   * clearing stale_*). Returns the saved record, or `null` when the CAS lost
   * (version changed under us) so the caller can retry.
   */
  saveComputed(input: SaveDayPlanInput): Promise<DayPlanRecord | null>;

  /**
   * Clear a STALE flag without routing when the fingerprint is unchanged (L-F04-01):
   * CAS on `version`, `status` back to PUBLISHED (or DRAFT when never published),
   * zero stale_*. Returns the updated record, or `null` when the CAS lost.
   */
  clearStale(id: string, expectedVersion: number): Promise<DayPlanRecord | null>;

  /** Mark PUBLISHED today/future plans STALE for the given appointments (idempotent, tz-correct). */
  markStaleByAppointmentIds(appointmentIds: string[], reason: string): Promise<number>;

  /** Mark PUBLISHED today/D+1 plans of an inspector STALE (base changed, R-F01-03). */
  markStaleByInspector(inspectorId: string, reason: string): Promise<number>;

  /** Record that the ROUTE_PUBLISHED notice was sent. */
  markNotified(id: string): Promise<void>;

  /** Null geometry/matrix/leg of plans before `todayCivilSydney`; returns rows touched. */
  purgePastRouteData(todayCivilSydney: string): Promise<number>;

  /** Error-minute samples (|check-in − published start|) for the accuracy metric (L-F04-04 join, frozen published). */
  getEtaAccuracySamples(fromCivil: string, toCivil: string): Promise<EtaAccuracySample[]>;
}
