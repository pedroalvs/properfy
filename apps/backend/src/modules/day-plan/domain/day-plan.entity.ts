import type {
  DayPlanStatus,
  DayPlanComputeTrigger,
  DayPlanOriginSource,
  RoutingProvider,
  RouteWeights,
  InspectorBaseAddress,
} from '@properfy/shared';

/** Persisted representation of a stored stop (Prisma Decimals already converted to number). */
export interface DayPlanStopRecord {
  id: string;
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

/** Persisted representation of a day plan with its stops. */
export interface DayPlanRecord {
  id: string;
  inspectorId: string;
  /** Civil date `YYYY-MM-DD`. */
  planDate: string;
  timezone: string;
  status: DayPlanStatus;
  version: number;
  inputFingerprint: string;
  publishedAt: Date | null;
  notifiedAt: Date | null;
  computedAt: Date;
  computedByUserId: string | null;
  lastTrigger: DayPlanComputeTrigger;
  staleAt: Date | null;
  staleReason: string | null;
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
  stops: DayPlanStopRecord[];
}
