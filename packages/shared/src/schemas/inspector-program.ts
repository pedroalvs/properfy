import { z } from 'zod';
import {
  GoalMetric,
  GoalComparator,
  RewardAwardStatus,
  InspectorLevel,
  BillingPeriodType,
  GOAL_METRIC_COMPARATOR,
  GOAL_METRIC_KIND,
} from '../enums';
import { civilDateSchema } from './civil-date';
import { booleanQueryParam } from './boolean-query';
import {
  civilDateStr,
  civilDateStrNullable,
  instantStr,
  instantStrNullable,
  paginatedResponseSchema,
} from './responses';

/**
 * Inspector program — goals & rewards request/response/query schemas (F08).
 *
 * The enums, labels and the `inspectorProgram` platform setting live in
 * `enums/inspector-program.ts` and the settings registry. This file carries only
 * the Zod contracts the API routes validate against. Civil dates in requests use
 * the strict `civilDateSchema` (rejects impossible calendar dates); response date
 * fields use the civil/instant wire-split helpers from `responses.ts`.
 */

// ─── Value sub-schemas (metric-dependent, applied in superRefine) ────────────

/** Volume goals: a whole number of completed services. */
const volumeTargetSchema = z.number().int().gt(0).max(10000);
/** Rate goals: a percentage with up to two decimals (P8). */
const rateTargetSchema = z.number().gt(0).max(100).multipleOf(0.01);
/** `INDEX_AT_LEAST`: index points with up to one decimal (matches the index scale). */
const indexTargetSchema = z.number().gt(0).max(100).multipleOf(0.1);
/** AUD reward amount: positive, at most 99999.99, two decimals. */
const rewardAmountSchema = z.number().gt(0).max(99999.99).multipleOf(0.01);

// ─── Create goal ─────────────────────────────────────────────────────────────

const baseCreateGoalShape = z.object({
  title: z.string().trim().min(1).max(120),
  metric: z.nativeEnum(GoalMetric),
  // Optional on the wire; defaulted to the metric's fixed comparator (P1) and
  // rejected when it disagrees.
  comparator: z.nativeEnum(GoalComparator).optional(),
  period: z.nativeEnum(BillingPeriodType),
  scopeRegionId: z.string().uuid().nullish(),
  scopeServiceTypeId: z.string().uuid().nullish(),
  scopeInspectorId: z.string().uuid().nullish(),
  target: z.number(),
  rewardAmount: z.number(),
  startsAt: civilDateSchema,
  endsAt: civilDateSchema.nullish(),
});

export const createGoalSchema = baseCreateGoalShape
  .superRefine((data, ctx) => {
    // Comparator is fixed per metric (P1).
    const expected = GOAL_METRIC_COMPARATOR[data.metric];
    if (data.comparator !== undefined && data.comparator !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comparator'],
        message: expected === 'LTE' ? "This metric uses 'at most'" : "This metric uses 'at least'",
      });
    }

    // Scope requirements per metric (P2).
    if (data.metric === GoalMetric.REGION_VOLUME) {
      if (!data.scopeRegionId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scopeRegionId'], message: 'Choose a region' });
      }
    } else if (data.scopeRegionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scopeRegionId'],
        message: 'Region applies only to region volume goals',
      });
    }
    if (data.metric === GoalMetric.SERVICE_TYPE_VOLUME) {
      if (!data.scopeServiceTypeId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scopeServiceTypeId'], message: 'Choose a service type' });
      }
    } else if (data.scopeServiceTypeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scopeServiceTypeId'],
        message: 'Service type applies only to service type volume goals',
      });
    }

    // Target bounds per metric kind.
    const kind = GOAL_METRIC_KIND[data.metric];
    const targetSchema = kind === 'VOLUME' ? volumeTargetSchema : kind === 'INDEX' ? indexTargetSchema : rateTargetSchema;
    if (!targetSchema.safeParse(data.target).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target'],
        message:
          kind === 'VOLUME'
            ? 'Target must be a whole number between 1 and 10000'
            : kind === 'INDEX'
              ? 'Target must be between 0 and 100, one decimal'
              : 'Target must be between 0 and 100, two decimals',
      });
    }

    // Reward amount.
    if (!rewardAmountSchema.safeParse(data.rewardAmount).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rewardAmount'],
        message: 'Reward must be between 0 and 99999.99, two decimals',
      });
    }

    // End must be on or after start (period alignment is checked server-side).
    if (data.endsAt != null && data.endsAt < data.startsAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'End date must be on or after the start date' });
    }
  })
  .transform((data) => ({
    title: data.title,
    metric: data.metric,
    comparator: data.comparator ?? GOAL_METRIC_COMPARATOR[data.metric],
    period: data.period,
    scopeRegionId: data.scopeRegionId ?? null,
    scopeServiceTypeId: data.scopeServiceTypeId ?? null,
    scopeInspectorId: data.scopeInspectorId ?? null,
    target: data.target,
    rewardAmount: data.rewardAmount,
    startsAt: data.startsAt,
    endsAt: data.endsAt ?? null,
  }));

export type CreateGoalInput = z.infer<typeof createGoalSchema>;

// ─── Update goal ─────────────────────────────────────────────────────────────

/**
 * Only the mutable fields may change; metric, period, scope and start are fixed
 * for the life of a goal (edit by creating a new one). `.strict()` turns any
 * other key into the documented message, and the refine rejects an empty PATCH.
 */
export const updateGoalSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    target: z.number().gt(0).optional(),
    rewardAmount: rewardAmountSchema.optional(),
    endsAt: civilDateSchema.nullish(),
    active: z.boolean().optional(),
  })
  .strict("This field can't be changed. Create a new goal instead.")
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

// ─── Reward actions ──────────────────────────────────────────────────────────

/**
 * Void body. `.strict()` so a stray `recoveryNote` (Q12 — manual payment was
 * removed) is rejected rather than silently ignored. The route tightens `reason`
 * to a 5-character minimum; the shared schema stays lenient (FR-009).
 */
export const voidAwardSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    inspectorNote: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type VoidAwardInput = z.infer<typeof voidAwardSchema>;

// ─── Period selector ─────────────────────────────────────────────────────────

export const PROGRAM_PERIOD_DIRECTIONS = ['upcoming', 'past'] as const;
export type ProgramPeriodDirection = (typeof PROGRAM_PERIOD_DIRECTIONS)[number];

export const programPeriodsQuerySchema = z
  .object({
    periodType: z.nativeEnum(BillingPeriodType),
    direction: z.enum(PROGRAM_PERIOD_DIRECTIONS),
    count: z.coerce.number().int().min(1).max(26),
  })
  .strict();
export type ProgramPeriodsQuery = z.infer<typeof programPeriodsQuerySchema>;

// ─── List / summary queries ──────────────────────────────────────────────────

export const listGoalsQuerySchema = z.object({
  active: booleanQueryParam().default(true),
  metric: z.nativeEnum(GoalMetric).optional(),
  period: z.nativeEnum(BillingPeriodType).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'title', 'startsAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;

export const listAwardsQuerySchema = z.object({
  status: z.nativeEnum(RewardAwardStatus).optional(),
  periodType: z.nativeEnum(BillingPeriodType).optional(),
  periodStart: civilDateSchema.optional(),
  goalId: z.string().uuid().optional(),
  inspectorId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListAwardsQuery = z.infer<typeof listAwardsQuerySchema>;

export const programPeriodSummaryQuerySchema = z.object({
  periodType: z.nativeEnum(BillingPeriodType),
  periodStart: civilDateSchema,
});
export type ProgramPeriodSummaryQuery = z.infer<typeof programPeriodSummaryQuerySchema>;

// ─── Responses ───────────────────────────────────────────────────────────────

const periodRangeSchema = z.object({ start: civilDateStr(), end: civilDateStr() });

/** A goal's pending term change (L-F08-02): effective from the next period. */
const pendingChangeSchema = z.object({
  target: z.number(),
  rewardAmount: z.number(),
  effectiveFrom: civilDateStr(),
});

export const goalResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  metric: z.nativeEnum(GoalMetric),
  comparator: z.nativeEnum(GoalComparator),
  target: z.number(),
  period: z.nativeEnum(BillingPeriodType),
  scopeRegionId: z.string().uuid().nullable(),
  scopeServiceTypeId: z.string().uuid().nullable(),
  scopeInspectorId: z.string().uuid().nullable(),
  scopeRegionName: z.string().nullable(),
  scopeServiceTypeName: z.string().nullable(),
  scopeInspectorName: z.string().nullable(),
  rewardAmount: z.number(),
  startsAt: civilDateStr(),
  endsAt: civilDateStrNullable(),
  active: z.boolean(),
  deactivatedAt: instantStrNullable(),
  // The pending target/reward change for a running goal; null when there is none.
  pendingChange: pendingChangeSchema.nullable(),
  // First period a reactivated goal counts again from; null when not reactivating.
  resumesOn: civilDateStrNullable(),
  // Smallest `endsAt` a PATCH may set (end of the current/first period).
  minEndsAt: civilDateStr(),
  currentPeriod: periodRangeSchema.nullable(),
  lastClosedPeriod: periodRangeSchema.nullable(),
  // True when a REGION_VOLUME goal's region was deleted (scope_region_id SetNull).
  scopeRegionDeleted: z.boolean(),
  // Author/updater ids; names are resolved client-side (the goal query joins only
  // scope targets, not users).
  createdByUserId: z.string().uuid(),
  updatedByUserId: z.string().uuid().nullable(),
  createdAt: instantStr(),
  updatedAt: instantStr(),
});
export type GoalResponse = z.infer<typeof goalResponseSchema>;

export const goalsListResponseSchema = paginatedResponseSchema(goalResponseSchema);

export const programPeriodStatusSchema = z.enum(['CLOSED', 'IN_PROGRESS', 'UPCOMING']);
export type ProgramPeriodStatus = z.infer<typeof programPeriodStatusSchema>;

export const programPeriodsResponseSchema = z.object({
  data: z.array(
    z.object({
      start: civilDateStr(),
      end: civilDateStr(),
      status: programPeriodStatusSchema,
    }),
  ),
});
export type ProgramPeriodsResponse = z.infer<typeof programPeriodsResponseSchema>;

export const rewardAwardResponseSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  inspectorId: z.string().uuid(),
  periodType: z.nativeEnum(BillingPeriodType),
  periodStart: civilDateStr(),
  periodEnd: civilDateStr(),
  // Immutable goal snapshot at close (L-F08-13).
  goalTitle: z.string(),
  metric: z.nativeEnum(GoalMetric),
  comparator: z.nativeEnum(GoalComparator),
  target: z.number(),
  amount: z.number(),
  scopeLabel: z.string().nullable(),
  // Result.
  achievedValue: z.number(),
  serviceCount: z.number().int(),
  achievedOn: civilDateStr(),
  indexScoreAtClose: z.number().nullable(),
  levelAtClose: z.nativeEnum(InspectorLevel).nullable(),
  indexSnapshotDate: civilDateStrNullable(),
  // Lifecycle.
  status: z.nativeEnum(RewardAwardStatus),
  approvedByUserId: z.string().uuid().nullable(),
  approvedByName: z.string().nullable(),
  approvedAt: instantStrNullable(),
  // Filled by TASK-F08-6 (invoice payment); always null in this slice.
  paidAt: instantStrNullable(),
  voidedByUserId: z.string().uuid().nullable(),
  voidedByName: z.string().nullable(),
  voidedAt: instantStrNullable(),
  voidReason: z.string().nullable(),
  inspectorNote: z.string().nullable(),
  goal: z.object({ id: z.string().uuid(), title: z.string() }),
  inspector: z.object({ id: z.string().uuid(), name: z.string(), email: z.string() }),
  createdAt: instantStr(),
  updatedAt: instantStr(),
});
export type RewardAwardResponse = z.infer<typeof rewardAwardResponseSchema>;

export const rewardAwardsListResponseSchema = paginatedResponseSchema(rewardAwardResponseSchema);

export const programPeriodTotalsSchema = z.object({
  promised: z.number(),
  achieved: z.number(),
  approved: z.number(),
  paid: z.number(),
  pending: z.number(),
  voided: z.number(),
});

export const programPeriodSummaryGoalSchema = z.object({
  goalId: z.string().uuid(),
  title: z.string(),
  metric: z.nativeEnum(GoalMetric),
  rewardAmount: z.number(),
  participants: z.number().int(),
  promised: z.number(),
  achievers: z.number().int(),
  achievedAmount: z.number(),
  closed: z.boolean(),
  skipped: z.boolean(),
});

export const programPeriodSummaryResponseSchema = z.object({
  periodType: z.nativeEnum(BillingPeriodType),
  periodStart: civilDateStr(),
  periodEnd: civilDateStr(),
  status: programPeriodStatusSchema,
  totals: programPeriodTotalsSchema,
  goals: z.array(programPeriodSummaryGoalSchema),
});
export type ProgramPeriodSummaryResponse = z.infer<typeof programPeriodSummaryResponseSchema>;
