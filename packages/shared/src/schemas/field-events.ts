import { z } from 'zod';
import {
  FieldIssueReason,
  FIELD_ISSUE_NOTE_REQUIRED_REASONS,
  LateNoticeReason,
} from '../enums/field-events';

/**
 * Inspector field-event contracts (TASK-F03-2). Request schemas are validated at
 * the Fastify boundary; response schemas also serve as Fastify response schemas,
 * so any field a consumer must see has to be declared here (undeclared fields
 * are stripped on serialization).
 *
 * CL privacy cut: `latitude`/`longitude` on `fieldEventItemSchema` and the
 * `*Latitude`/`*Longitude` on `executionSummarySchema` are declared optional and
 * are simply omitted for CL roles by the field-activity use case — a raw
 * inspector coordinate is never sent to an agency role.
 */

// Local instant helpers, mirroring schemas/responses.ts (kept local to avoid a
// cross-schema import cycle).
const instantStr = () => z.union([z.string(), z.date().transform((d) => d.toISOString())]);
const instantStrNullable = () => instantStr().nullable();

/** Optional inspector position shared by both field-event request bodies. */
const optionalPosition = {
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().nonnegative().finite().optional(),
  clientOccurredAt: z.string().datetime({ offset: true }).optional(),
};

function requireLatLngTogether(
  data: { latitude?: number; longitude?: number },
  ctx: z.RefinementCtx,
): void {
  if ((data.latitude === undefined) !== (data.longitude === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['longitude'],
      message: 'Latitude and longitude must be sent together',
    });
  }
}

export const cantDoRequestSchema = z
  .object({
    reason: z.nativeEnum(FieldIssueReason),
    note: z.string().trim().max(500).optional(),
    ...optionalPosition,
  })
  .superRefine((data, ctx) => {
    if (
      FIELD_ISSUE_NOTE_REQUIRED_REASONS.includes(data.reason) &&
      (!data.note || data.note.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'Add a short note for this reason',
      });
    }
    requireLatLngTogether(data, ctx);
  });
export type CantDoRequest = z.infer<typeof cantDoRequestSchema>;

export const cantDoResponseSchema = z.object({
  eventId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  appointmentStatus: z.literal('REJECTED'),
  occurredAt: instantStr(),
  executionAbandoned: z.boolean(),
});
export type CantDoResponse = z.infer<typeof cantDoResponseSchema>;

export const lateNoticeRequestSchema = z
  .object({
    reason: z.nativeEnum(LateNoticeReason),
    minutesLate: z.number().int().min(5).max(240),
    ...optionalPosition,
  })
  .superRefine(requireLatLngTogether);
export type LateNoticeRequest = z.infer<typeof lateNoticeRequestSchema>;

export const lateNoticeResponseSchema = z.object({
  eventId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  occurredAt: instantStr(),
  reason: z.nativeEnum(LateNoticeReason),
  /** Estimated delay in minutes, relative to `referenceAt`. */
  minutesLate: z.number().int(),
  /** Published-plan stop start when available, else the booked window start. */
  referenceAt: instantStr(),
  referenceSource: z.enum(['PUBLISHED_PLAN', 'WINDOW_START']),
  /** max(referenceAt, effectiveNoticeAt) + minutesLate, computed server-side. */
  estimatedArrivalAt: instantStr(),
});
export type LateNoticeResponse = z.infer<typeof lateNoticeResponseSchema>;

/** Latest "Can't do this job" of an appointment, flattened onto list/detail. */
export const inspectorIssueSchema = z.object({
  // z.string() (not the enum) so a future reason value never trips the serializer.
  reason: z.string(),
  note: z.string().nullable(),
  // L-F03-09: lets the web mark "(current inspector)". Optional so a cached older
  // payload without it still parses.
  inspectorId: z.string().uuid().nullable().optional(),
  inspectorName: z.string().nullable(),
  occurredAt: instantStr(),
});
export type InspectorIssue = z.infer<typeof inspectorIssueSchema>;

/** The inspector's own last "Can't do this job" on their appointment detail. */
export const inspectorLastFieldIssueSchema = z.object({
  reason: z.string(),
  note: z.string().nullable(),
  occurredAt: instantStr(),
});
export type InspectorLastFieldIssue = z.infer<typeof inspectorLastFieldIssueSchema>;

/** One field-event row in the field-activity response. */
export const fieldEventItemSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  reason: z.string(),
  note: z.string().nullable(), // CANT_DO only; always null for LATE_NOTICE
  minutesLate: z.number().int().nullable(),
  inspectorName: z.string().nullable(),
  occurredAt: instantStr(),
  clientOccurredAt: instantStrNullable(),
  accuracyMeters: z.number().nullable(),
  latitude: z.number().nullable().optional(), // AM/OP only — omitted for CL
  longitude: z.number().nullable().optional(), // AM/OP only — omitted for CL
});
export type FieldEventItem = z.infer<typeof fieldEventItemSchema>;

/** Execution summary in the field-activity response. */
export const executionSummarySchema = z.object({
  id: z.string().uuid(),
  inspectorName: z.string().nullable(),
  startedAt: instantStr(),
  finishedAt: instantStrNullable(),
  abandonedAt: instantStrNullable(),
  startClientAt: instantStrNullable(),
  finishClientAt: instantStrNullable(),
  startDistanceMeters: z.number().nullable(),
  finishDistanceMeters: z.number().nullable(),
  startAccuracyMeters: z.number().nullable(),
  finishAccuracyMeters: z.number().nullable(),
  outOfRadius: z.boolean(),
  outOfWindow: z.boolean(),
  finishOutOfRadius: z.boolean(),
  geofenceRadiusMeters: z.number().int().nullable(),
  startLatitude: z.number().optional(), // AM/OP only
  startLongitude: z.number().optional(), // AM/OP only
  finishLatitude: z.number().nullable().optional(), // AM/OP only
  finishLongitude: z.number().nullable().optional(), // AM/OP only
});
export type ExecutionSummary = z.infer<typeof executionSummarySchema>;

export const appointmentFieldActivityResponseSchema = z.object({
  execution: executionSummarySchema.nullable(),
  events: z.array(fieldEventItemSchema),
});
export type AppointmentFieldActivityResponse = z.infer<
  typeof appointmentFieldActivityResponseSchema
>;
