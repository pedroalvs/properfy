import { z } from 'zod';
import {
  GoalMetric,
  GoalComparator,
  RewardAwardStatus,
  InspectorLevel,
  BillingPeriodType,
  InspectorInvoiceStatus,
  GOAL_METRIC_COMPARATOR,
  GOAL_METRIC_KIND,
} from '../enums';
import { civilDateSchema } from './civil-date';
import { booleanQueryParam } from './boolean-query';
import { reliabilityDetailStatusSchema } from './reliability';
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
  // Q12 (TASK-F08-6): PAID is set when the inspector invoice carrying the bonus is paid.
  paidAt: instantStrNullable(),
  voidedByUserId: z.string().uuid().nullable(),
  voidedByName: z.string().nullable(),
  voidedAt: instantStrNullable(),
  voidReason: z.string().nullable(),
  inspectorNote: z.string().nullable(),
  goal: z.object({ id: z.string().uuid(), title: z.string() }),
  inspector: z.object({ id: z.string().uuid(), name: z.string(), email: z.string() }),
  // Q12 (TASK-F08-6): the bonus ledger entry id, the inspector invoice it rode (once
  // closed) and whether the void happened after the bonus was invoiced (AM-only reversal).
  financialEntryId: z.string().uuid().nullable(),
  invoice: z
    .object({
      id: z.string().uuid(),
      invoiceNumberDisplay: z.string().nullable(),
      status: z.nativeEnum(InspectorInvoiceStatus),
    })
    .nullable(),
  voidedAfterInvoicing: z.boolean(),
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

// ─── Inspector-facing program (GET /v1/inspector/program) — TASK-F08-4 ─────────

/** Progress state of an active goal the inspector participates in. */
export const inspectorProgramGoalStateSchema = z.enum([
  'MET_SO_FAR',
  'IN_PROGRESS',
  'BELOW_TARGET',
  'NOT_ENOUGH_SERVICES',
  'NO_DATA',
  'UPCOMING',
]);
export type InspectorProgramGoalState = z.infer<typeof inspectorProgramGoalStateSchema>;

const inspectorProgramActiveGoalSchema = z.object({
  goalId: z.string().uuid(),
  title: z.string(),
  // Rendered server-side (describeGoal) so the client needs no scope lookup.
  description: z.string(),
  metric: z.nativeEnum(GoalMetric),
  comparator: z.nativeEnum(GoalComparator),
  target: z.number(),
  periodType: z.nativeEnum(BillingPeriodType),
  periodStart: civilDateStr(),
  periodEnd: civilDateStr(),
  daysLeft: z.number().int(),
  rewardAmount: z.number(),
  value: z.number().nullable(),
  serviceCount: z.number().int(),
  minimumServices: z.number().int().nullable(),
  state: inspectorProgramGoalStateSchema,
  // L-F08-12: next period start when UPCOMING, else null.
  startsOn: civilDateStrNullable(),
  // L-F08-12: period start when the goal began mid-period, else null.
  countsSince: civilDateStrNullable(),
});

const inspectorProgramStandingSchema = z.object({
  index: z.object({
    score: z.number().nullable(),
    status: reliabilityDetailStatusSchema,
    snapshotDate: civilDateStrNullable(),
  }),
  level: z.nativeEnum(InspectorLevel).nullable(),
  streak: z.object({
    cycle: z.nativeEnum(BillingPeriodType).nullable(),
    count: z.number().int(),
    atRisk: z.boolean(),
  }),
});

const inspectorProgramAwardSchema = z.object({
  goalTitle: z.string(),
  metric: z.nativeEnum(GoalMetric),
  periodType: z.nativeEnum(BillingPeriodType),
  periodStart: civilDateStr(),
  periodEnd: civilDateStr(),
  amount: z.number(),
  achievedValue: z.number(),
  status: z.nativeEnum(RewardAwardStatus),
  // paidAt = the inspector invoice's paid_at (Q12, TASK-F08-6).
  paidAt: instantStrNullable(),
  voidedAt: instantStrNullable(),
  // L-F08-05: the note written for the inspector; the internal void_reason is never exposed.
  inspectorNote: z.string().nullable(),
});

/**
 * One anonymous ranking row (03.A3). `.strict()` guarantees the serialized row
 * carries exactly these four keys — no inspector id, name, photo, email or phone —
 * as a contract-level backstop to the server-side anonymiser.
 */
export const inspectorProgramRankingEntrySchema = z
  .object({
    position: z.number().int(),
    score: z.number(),
    level: z.nativeEnum(InspectorLevel).nullable(),
    isMe: z.boolean(),
  })
  .strict();
export type InspectorProgramRankingEntry = z.infer<typeof inspectorProgramRankingEntrySchema>;

const inspectorProgramRankingSchema = z.object({
  myPosition: z.number().int().nullable(),
  myScore: z.number().nullable(),
  totalRanked: z.number().int(),
  notRankedReason: z.enum(['NOT_ENOUGH_DATA', 'NOT_COMPUTED']).nullable(),
  cohortTooSmall: z.boolean(),
  // Empty when cohortTooSmall (DV4).
  entries: z.array(inspectorProgramRankingEntrySchema),
});

/**
 * `GET /v1/inspector/program` response (INSP, own data only). Civil dates are
 * `PLATFORM_TIMEZONE` values from the backend; `generatedAt`/`paidAt`/`voidedAt`
 * are UTC instants (DR5). The ranking exposes no other inspector's identity (03.A3).
 */
export const inspectorProgramResponseSchema = z.object({
  generatedAt: instantStr(),
  timezone: z.literal('Australia/Sydney'),
  summary: z.object({
    openCashTotal: z.number(),
    currency: z.literal('AUD'),
  }),
  activeGoals: z.array(inspectorProgramActiveGoalSchema),
  standing: inspectorProgramStandingSchema,
  awards: z.array(inspectorProgramAwardSchema),
  ranking: inspectorProgramRankingSchema,
});
export type InspectorProgramResponse = z.infer<typeof inspectorProgramResponseSchema>;
