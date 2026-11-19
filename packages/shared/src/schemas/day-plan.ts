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

/** Response of `POST /v1/inspector/day-plans/:date/order/preview` — matrix ETAs of a candidate order, nothing persisted. */
export const previewDayPlanOrderResponseSchema = z.object({
  etaSource: z.literal('MATRIX'),
  approximate: z.boolean(),
  approximateReason: z
    .enum(['NO_PROVIDER', 'RATE_LIMITED', 'PROVIDER_ERROR', 'DEADLINE', 'TOO_MANY_COORDINATES', 'NO_ROUTE'])
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
  stops: z.array(
    z.object({
      appointmentId: z.string().uuid(),
      sequence: z.number().int(),
      eta: instantStrNullable(),
      travelS: z.number().int(),
      waitS: z.number().int(),
      lateS: z.number().int(),
    }),
  ),
});
export type PreviewDayPlanOrderResponse = z.infer<typeof previewDayPlanOrderResponseSchema>;

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

export const previewDayPlanOrderRequestSchema = saveDayPlanOrderRequestSchema;
export type PreviewDayPlanOrderRequest = z.infer<typeof previewDayPlanOrderRequestSchema>;

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
