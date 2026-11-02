import { z } from 'zod';
import { civilDateSchema } from './civil-date';
import { inspectorBaseAddressSchema } from './address';
import { routeWeightsSettingSchema } from './platform-settings';
import {
  DAY_PLAN_MAX_STOPS_PER_ORDER,
  ROUTE_ETA_ACCURACY_MIN_DAYS,
  ROUTE_ETA_ACCURACY_MAX_DAYS,
  ROUTE_ETA_ACCURACY_DEFAULT_DAYS,
  ROUTE_ETA_ACCURACY_THRESHOLD_MINUTES,
  ROUTE_ETA_ACCURACY_MIN_SAMPLE,
} from '../constants/day-plan';
import type { OptimizerInput, OptimizerStop } from '../route-planning/types';

// Module-private instant/date helpers (same pattern as field-events.ts).
const instantStr = () => z.union([z.string(), z.date().transform((d) => d.toISOString())]);
const instantStrNullable = () => instantStr().nullable();
const civilDateStr = () => z.union([z.string(), z.date().transform((d) => d.toISOString().slice(0, 10))]);

// -----------------------------------------------------------------------------
// Geometry
// -----------------------------------------------------------------------------
const geoLineString = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});

export const dayPlanGeometrySchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      type: z.literal('Feature'),
      geometry: geoLineString,
      properties: z.object({
        fromSequence: z.number().int(),
        toSequence: z.number().int(),
        approximate: z.boolean(),
      }),
    }),
  ),
});
export type DayPlanGeometry = z.infer<typeof dayPlanGeometrySchema>;

// -----------------------------------------------------------------------------
// Stop
// -----------------------------------------------------------------------------
export const dayPlanStopSchema = z.object({
  appointmentId: z.string().uuid(),
  sequence: z.number().int().min(1),
  appointmentCode: z.string(),
  agencyName: z.string(),
  appointmentStatus: z.enum(['SCHEDULED', 'DONE']),
  executionStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'FINISHED']),
  eta: instantStrNullable(),
  serviceStartAt: instantStrNullable(),
  serviceEndAt: instantStrNullable(),
  travelS: z.number().int(),
  distanceM: z.number().int().nullable(),
  waitS: z.number().int(),
  lateS: z.number().int(),
  windowStart: z.string(),
  windowEnd: z.string(),
  windowStartAt: instantStr(),
  windowEndAt: instantStr(),
  timezone: z.string(),
  durationMinutes: z.number().int(),
  manual: z.boolean(),
  executed: z.boolean(),
  approximate: z.boolean(),
  missingCoordinates: z.boolean(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  propertyAddress: z.string(),
  suburb: z.string(),
  serviceTypeName: z.string(),
  keyRequired: z.boolean(),
  meetingLocation: z.string().nullable(),
  rentalTenantConfirmationStatus: z.string(),
  primaryContact: z
    .object({
      name: z.string(),
      phone: z.string().nullable(),
      role: z.enum([
        'RENTAL_TENANT',
        'RENTAL_TENANT_REPRESENTATIVE',
        'HOUSEKEEPER',
        'PROPERTY_MANAGER',
        'BROKER',
        'OTHER',
      ]),
    })
    .nullable(),
});
export type DayPlanStop = z.infer<typeof dayPlanStopSchema>;

// -----------------------------------------------------------------------------
// routingInput (Plan A, L-F04-03): raw matrix forwarded to the client for local reorder.
// -----------------------------------------------------------------------------
export const dayPlanRoutingInputSchema = z.object({
  points: z.array(z.object({ key: z.string(), lat: z.number(), lng: z.number() })),
  travelS: z.array(z.array(z.number().int())),
  originKey: z.literal('origin').nullable(),
  earliestDepartureAt: instantStrNullable(),
  weights: z.object({ travel: z.number(), windowWait: z.number(), baseProximity: z.number() }),
  legTravelS: z.array(
    z.object({ fromKey: z.string(), toKey: z.string(), travelS: z.number().int() }),
  ),
});
export type DayPlanRoutingInput = z.infer<typeof dayPlanRoutingInputSchema>;

// -----------------------------------------------------------------------------
// Response
// -----------------------------------------------------------------------------
export const dayPlanResponseSchema = z.object({
  id: z.string().uuid(),
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  date: civilDateStr(),
  timezone: z.string(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'STALE']),
  version: z.number().int(),
  publishedAt: instantStrNullable(),
  computedAt: instantStr(),
  lastTrigger: z.enum(['SCHEDULED_PUBLISH', 'ON_OPEN', 'MANUAL_RECALC', 'REORDER', 'ORIGIN_CHANGE']),
  approximate: z.boolean(),
  approximateReason: z
    .enum(['NO_PROVIDER', 'RATE_LIMITED', 'PROVIDER_ERROR', 'DEADLINE', 'TOO_MANY_COORDINATES', 'NO_ROUTE'])
    .nullable(),
  routingProvider: z.enum(['MAPBOX', 'STUB']),
  matrixProfile: z.enum(['driving-traffic', 'driving', 'haversine']).nullable(),
  optimizerMethod: z.enum(['TRIVIAL', 'EXACT', 'HEURISTIC', 'INSERTION', 'FIXED']),
  origin: z.object({
    source: z.enum(['BASE', 'OVERRIDE', 'NONE', 'LAST_STOP']),
    label: z.string().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
  }),
  originWarning: z.enum(['NO_BASE', 'BASE_NOT_LOCATED']).nullable(),
  originOverride: z
    .object({ address: inspectorBaseAddressSchema, setAt: instantStr() })
    .nullable(),
  departureAt: instantStrNullable(),
  finishEta: instantStrNullable(),
  totals: z.object({
    driveS: z.number().int(),
    waitS: z.number().int(),
    serviceS: z.number().int(),
    lateS: z.number().int(),
    distanceM: z.number().int().nullable(),
  }),
  feasible: z.boolean(),
  violations: z.array(z.object({ appointmentId: z.string().uuid(), lateS: z.number().int() })),
  manualOrder: z.boolean(),
  suggestedOrder: z.array(z.string().uuid()),
  stops: z.array(dayPlanStopSchema),
  geometry: dayPlanGeometrySchema.nullable(),
  routingInput: dayPlanRoutingInputSchema.nullable(),
});
export type DayPlanResponse = z.infer<typeof dayPlanResponseSchema>;

// -----------------------------------------------------------------------------
// Weights preview + ETA-accuracy metric
// -----------------------------------------------------------------------------
export const routeWeightsPreviewSchema = z.object({
  weights: z.object({ travel: z.number(), windowWait: z.number(), baseProximity: z.number() }),
  etaSource: z.literal('MATRIX'),
  approximate: z.boolean(),
  departureAt: instantStrNullable(),
  finishEta: instantStrNullable(),
  totals: z.object({ driveS: z.number().int(), waitS: z.number().int(), lateS: z.number().int() }),
  feasible: z.boolean(),
  stops: z.array(
    z.object({
      appointmentId: z.string().uuid(),
      sequence: z.number().int(),
      appointmentCode: z.string(),
      suburb: z.string(),
      windowStart: z.string(),
      windowEnd: z.string(),
      timezone: z.string(),
      eta: instantStr(),
      lateS: z.number().int(),
    }),
  ),
});
export type RouteWeightsPreview = z.infer<typeof routeWeightsPreviewSchema>;

export const routeWeightsPreviewResponseSchema = z.object({
  current: routeWeightsPreviewSchema,
  proposed: routeWeightsPreviewSchema,
});
export type RouteWeightsPreviewResponse = z.infer<typeof routeWeightsPreviewResponseSchema>;

export const routeEtaAccuracySchema = z.object({
  from: civilDateStr(),
  to: civilDateStr(),
  days: z.number().int(),
  sampleSize: z.number().int(),
  excludedOutliers: z.number().int(),
  meanAbsoluteErrorMinutes: z.number().nullable(),
  thresholdMinutes: z.literal(ROUTE_ETA_ACCURACY_THRESHOLD_MINUTES),
  minSampleSize: z.literal(ROUTE_ETA_ACCURACY_MIN_SAMPLE),
  status: z.enum(['INSUFFICIENT_DATA', 'OK', 'ABOVE_THRESHOLD']),
});
export type RouteEtaAccuracy = z.infer<typeof routeEtaAccuracySchema>;

// -----------------------------------------------------------------------------
// Request schemas
// -----------------------------------------------------------------------------
export const saveDayPlanOrderRequestSchema = z.object({
  appointmentIds: z
    .array(z.string().uuid())
    .min(1)
    .max(DAY_PLAN_MAX_STOPS_PER_ORDER)
    .refine((ids) => new Set(ids).size === ids.length, 'appointmentIds must be unique'),
  basedOnVersion: z.number().int().min(1),
});
export type SaveDayPlanOrderRequest = z.infer<typeof saveDayPlanOrderRequestSchema>;

export const setDayPlanOriginRequestSchema = z.object({ address: inspectorBaseAddressSchema });
export type SetDayPlanOriginRequest = z.infer<typeof setDayPlanOriginRequestSchema>;

export const previewRouteWeightsRequestSchema = z.object({
  inspectorId: z.string().uuid(),
  date: civilDateSchema,
  weights: routeWeightsSettingSchema,
});
export type PreviewRouteWeightsRequest = z.infer<typeof previewRouteWeightsRequestSchema>;

export const dayPlanSheetQuerySchema = z.object({ format: z.enum(['pdf', 'xlsx']) });
export type DayPlanSheetQuery = z.infer<typeof dayPlanSheetQuerySchema>;

export const routeEtaAccuracyQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(ROUTE_ETA_ACCURACY_MIN_DAYS)
    .max(ROUTE_ETA_ACCURACY_MAX_DAYS)
    .default(ROUTE_ETA_ACCURACY_DEFAULT_DAYS),
});
export type RouteEtaAccuracyQuery = z.infer<typeof routeEtaAccuracyQuerySchema>;

// -----------------------------------------------------------------------------
// Local reorder helpers (consumed by the PWA; L-F04-16 contract for Part B)
// -----------------------------------------------------------------------------

/**
 * Build an `OptimizerInput` from a plan response so the PWA can reorder stops
 * locally. Returns `null` when the plan has no `routingInput` (fewer than two
 * reorderable stops with coordinates, or after the next-day purge). `now` sets
 * `earliestDepartureS = max(now, routingInput.earliestDepartureAt)` for today.
 */
export function toOptimizerInput(plan: DayPlanResponse, now: Date): OptimizerInput | null {
  const ri = plan.routingInput;
  if (!ri) return null;
  const pointIndex = new Map(ri.points.map((p, i) => [p.key, i] as const));
  const stops: OptimizerStop[] = [];
  for (const stop of plan.stops) {
    if (stop.executed || stop.lat === null || stop.lng === null) continue;
    const matrixIndex = pointIndex.get(stop.appointmentId);
    if (matrixIndex === undefined) continue;
    stops.push({
      key: stop.appointmentId,
      windowStartS: Math.floor(Date.parse(toIso(stop.windowStartAt)) / 1000),
      windowEndS: Math.floor(Date.parse(toIso(stop.windowEndAt)) / 1000),
      serviceS: stop.durationMinutes * 60,
      matrixIndex,
    });
  }
  if (stops.length < 2) return null;
  const originIndex = ri.originKey ? pointIndex.get(ri.originKey) ?? null : null;
  const earliestFromPlan =
    ri.earliestDepartureAt !== null ? Math.floor(Date.parse(toIso(ri.earliestDepartureAt)) / 1000) : null;
  const earliestDepartureS =
    earliestFromPlan !== null ? Math.max(Math.floor(now.getTime() / 1000), earliestFromPlan) : null;
  return { stops, travelS: ri.travelS, originIndex, earliestDepartureS, weights: ri.weights };
}

/**
 * For each adjacent pair of the proposed `order` (origin → order[0], then
 * order[i-1] → order[i]), return the stored Directions leg duration when that
 * pair already existed in the saved order, else `null` so `evaluateSequence`
 * falls back to the Matrix. Position-indexed to match `evaluateSequence`'s
 * `legTravelS` (leg arriving at `order[i]`).
 */
export function buildLegOverrides(
  order: string[],
  routingInput: DayPlanRoutingInput | null,
): Array<number | null> {
  if (!routingInput) return order.map(() => null);
  const legMap = new Map(
    routingInput.legTravelS.map((l) => [`${l.fromKey}\u0000${l.toKey}`, l.travelS] as const),
  );
  const overrides: Array<number | null> = [];
  let prev: string | null = routingInput.originKey;
  for (const key of order) {
    overrides.push(prev !== null ? legMap.get(`${prev}\u0000${key}`) ?? null : null);
    prev = key;
  }
  return overrides;
}

function toIso(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString();
}
