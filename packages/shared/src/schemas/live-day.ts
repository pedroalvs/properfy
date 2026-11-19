import { z } from 'zod';
import { civilDateSchema } from './civil-date';
import { civilDateStr, instantStr, instantStrNullable } from './responses';
import { dayPlanGeometrySchema } from './day-plan';
import {
  LiveDayInspectorState,
  LiveDayStopProgress,
  LiveDayAlertType,
  LiveDayLastKnownSource,
  LiveDayThresholdSource,
  LiveDayGeofencePhase,
} from '../enums/live-day';

/**
 * Live Day (F05) request + response contracts. All reads are AM/OP cross-tenant
 * (D14). Reuses `dayPlanGeometrySchema` (F04) exactly and the wire helpers from
 * `responses.ts`. Every nullable field is declared `.nullable()` so the Fastify
 * serializer never throws on an absent value.
 */

// ── live-day ────────────────────────────────────────────────────────────────

export const liveDayQuerySchema = z.object({
  date: civilDateSchema.optional(), // default: actor civil today (use case)
  includeGeometry: z.enum(['none', 'selected', 'all']).default('none'),
  inspectorId: z.string().uuid().optional(), // required when includeGeometry = 'selected' (use case)
});
export type LiveDayQuery = z.infer<typeof liveDayQuerySchema>;

export const liveDayAlertSchema = z.object({
  type: z.nativeEnum(LiveDayAlertType),
  occurredAt: instantStr(),
  appointmentId: z.string().uuid().nullable(),
  appointmentCode: z.string().nullable(),
  minutes: z.number().int().nullable(),
  estimatedArrivalAt: instantStrNullable(),
  thresholdMinutes: z.number().int().nullable(),
  thresholdSource: z.nativeEnum(LiveDayThresholdSource).nullable(),
  reason: z.string().nullable(),
  reasonLabel: z.string().nullable(),
  note: z.string().nullable(),
  phase: z.nativeEnum(LiveDayGeofencePhase).nullable(),
  distanceMeters: z.number().int().nullable(),
  radiusMeters: z.number().int().nullable(),
});
export type LiveDayAlert = z.infer<typeof liveDayAlertSchema>;

export const liveDayStopSchema = z.object({
  appointmentId: z.string().uuid(),
  appointmentCode: z.string(),
  sequence: z.number().int().min(1).nullable(), // null = out of plan (inPlan false)
  inPlan: z.boolean(),
  progress: z.nativeEnum(LiveDayStopProgress),
  agencyName: z.string(),
  propertyAddress: z.string(),
  suburb: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  missingCoordinates: z.boolean(),
  windowStart: z.string(), // "HH:mm" agency wall time
  windowEnd: z.string(),
  timezone: z.string(),
  startedAt: instantStrNullable(),
  finishedAt: instantStrNullable(),
  predictedStartAt: instantStrNullable(),
  publishedStartAt: instantStrNullable(),
  delayMinutes: z.number().int().nullable(),
});
export type LiveDayStop = z.infer<typeof liveDayStopSchema>;

const liveDayRouteViolationSchema = z.object({
  appointmentId: z.string().uuid(),
  appointmentCode: z.string(),
  sequence: z.number().int().min(1),
  lateMinutes: z.number().int().min(1), // ceil(late_s / 60)
});

export const liveDayInspectorSchema = z.object({
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  state: z.nativeEnum(LiveDayInspectorState),
  lastKnown: z.object({
    source: z.nativeEnum(LiveDayLastKnownSource),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    at: instantStrNullable(),
    appointmentId: z.string().uuid().nullable(),
    label: z.string().nullable(),
  }),
  progress: z.object({
    done: z.number().int(),
    inProgress: z.number().int(),
    remaining: z.number().int(),
    total: z.number().int(),
  }),
  delayMinutes: z.number().int().nullable(),
  thresholds: z.object({
    delayMinutes: z.number().int(),
    delaySource: z.nativeEnum(LiveDayThresholdSource),
    notStartedMinutes: z.number().int(),
    notStartedSource: z.nativeEnum(LiveDayThresholdSource),
  }),
  alerts: z.array(liveDayAlertSchema),
  needsAttention: z.boolean(),
  dayPlanId: z.string().uuid().nullable(),
  planStatus: z.enum(['DRAFT', 'PUBLISHED', 'STALE', 'NONE']),
  planVersion: z.number().int().nullable(),
  routeOutOfDate: z.boolean(),
  routeApproximate: z.boolean(),
  routeFeasible: z.boolean(),
  routeViolations: z.array(liveDayRouteViolationSchema),
  origin: z
    .object({ lat: z.number(), lng: z.number(), label: z.string().nullable() })
    .nullable(), // null when no origin or origin_source 'LAST_STOP' (L-F04-07)
  geometryIncluded: z.boolean(),
  geometry: dayPlanGeometrySchema.nullable(),
  stops: z.array(liveDayStopSchema),
});
export type LiveDayInspector = z.infer<typeof liveDayInspectorSchema>;

export const liveDayResponseSchema = z.object({
  date: civilDateStr(),
  today: civilDateStr(), // actor's server-side civil today (L-F05-05)
  timezone: z.string(),
  isToday: z.boolean(),
  generatedAt: instantStr(),
  thresholdsDefault: z.object({
    delayMinutes: z.number().int(),
    notStartedMinutes: z.number().int(),
  }),
  summary: z.object({
    inspectors: z.number().int(),
    notStarted: z.number().int(),
    atProperty: z.number().int(),
    inTransit: z.number().int(),
    doneForDay: z.number().int(),
    needsAttention: z.number().int(),
    stopsDone: z.number().int(),
    stopsTotal: z.number().int(),
  }),
  inspectors: z.array(liveDayInspectorSchema), // sorted by inspectorName (localeCompare 'en-AU')
});
export type LiveDayResponse = z.infer<typeof liveDayResponseSchema>;

// ── locked-time (01.13) ───────────────────────────────────────────────────────

export const lockedTimeQuerySchema = z.object({
  from: civilDateSchema.optional(),
  to: civilDateSchema.optional(),
});
export type LockedTimeQuery = z.infer<typeof lockedTimeQuerySchema>;

const lockedRow = {
  confirmed: z.number().int(),
  required: z.number().int(),
  percent: z.number().nullable(), // rounded to 1 dp; null when required = 0
};

export const lockedTimeResponseSchema = z.object({
  from: civilDateStr(),
  to: civilDateStr(),
  generatedAt: instantStr(),
  overall: z.object({ ...lockedRow }),
  byAgency: z.array(z.object({ tenantId: z.string().uuid(), agencyName: z.string(), ...lockedRow })),
  byRegion: z.array(
    z.object({
      regionId: z.string().uuid().nullable(), // null = "No region" (always last)
      regionName: z.string(),
      agencyName: z.string().nullable(), // region owner; null = global region or "No region" (L-F05-13)
      ...lockedRow,
    }),
  ),
});
export type LockedTimeResponse = z.infer<typeof lockedTimeResponseSchema>;

// ── inspector alert thresholds ────────────────────────────────────────────────

export const updateInspectorAlertThresholdsSchema = z
  .object({
    delayMinutes: z.number().int().min(5).max(240).nullable(),
    notStartedMinutes: z.number().int().min(5).max(240).nullable(),
  })
  .strict(); // both keys required; null = use the platform default for that field
export type UpdateInspectorAlertThresholdsInput = z.infer<
  typeof updateInspectorAlertThresholdsSchema
>;

export const inspectorAlertThresholdsResponseSchema = z.object({
  inspectorId: z.string().uuid(),
  platformDefaults: z.object({ delayMinutes: z.number().int(), notStartedMinutes: z.number().int() }),
  override: z.object({
    delayMinutes: z.number().int().nullable(),
    notStartedMinutes: z.number().int().nullable(),
  }),
  effective: z.object({ delayMinutes: z.number().int(), notStartedMinutes: z.number().int() }),
});
export type InspectorAlertThresholdsResponse = z.infer<
  typeof inspectorAlertThresholdsResponseSchema
>;
