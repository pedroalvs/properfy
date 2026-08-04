import { z } from 'zod';
import { WORKLOAD_LEVELS } from '../constants/inspector-workload';
import { civilDateSchema } from './civil-date';

/**
 * Contracts for the Inspector Workload screen — one Monday-anchored week at a
 * time: who is carrying how much, on which day, and how the week compares with
 * the weeks either side of it.
 *
 * Everything here is keyed on `scheduled_date`, a civil date. The screen never
 * mixes in an execution timestamp: a figure derived from `done_checked_at` would
 * not be comparable with the ones beside it, and that column is null for every
 * DONE appointment still waiting on the operator cross-check.
 */

const countSchema = z.number().int().nonnegative();

/** Days in a week — the fixed width of every per-day tuple below. */
export const WORKLOAD_WEEK_LENGTH = 7;

const weekDayCountsSchema = z.array(countSchema).length(WORKLOAD_WEEK_LENGTH);

function isMonday(civilDate: string): boolean {
  return new Date(`${civilDate}T00:00:00.000Z`).getUTCDay() === 1;
}

/**
 * `weekStart` is optional: omitted, the server resolves the current Sydney week.
 *
 * A non-Monday is rejected rather than snapped. The UI only ever emits Mondays
 * (its selector snaps before writing the URL), so a non-Monday reaching the API
 * means a client bug, and snapping would hide it behind plausible-looking data.
 */
export const inspectorWorkloadQuerySchema = z.object({
  weekStart: civilDateSchema
    .refine(isMonday, { message: 'weekStart must be a Monday' })
    .optional(),
});

export type InspectorWorkloadQuery = z.infer<typeof inspectorWorkloadQuerySchema>;

const inspectorRefSchema = z.object({
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  total: countSchema,
});

/**
 * One week of the comparison strip.
 *
 * `scheduled` is total committed work (`SCHEDULED + DONE`) and is the
 * denominator for both other figures, so neither can exceed 100% on the shared
 * scale the three panels share.
 *
 * `confirmed` honours the service-type gate: a service type that does not
 * require rental-tenant confirmation is operationally confirmed once scheduled,
 * so it counts without a portal response. `confirmationEligible` reports how
 * many of the week's appointments actually needed one.
 */
export const weekFunnelSchema = z.object({
  weekStart: civilDateSchema,
  weekEnd: civilDateSchema,
  done: countSchema,
  scheduled: countSchema,
  confirmed: countSchema,
  confirmationEligible: countSchema,
});

export type WeekFunnel = z.infer<typeof weekFunnelSchema>;

export const workloadMatrixRowSchema = z.object({
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  /**
   * False for an inspector who is INACTIVE or soft-deleted but still carries
   * work this week. Such a row must render, or the team total would not equal
   * the sum of the visible rows.
   */
  isActive: z.boolean(),
  days: weekDayCountsSchema,
  total: countSchema,
  level: z.enum(WORKLOAD_LEVELS),
});

export type WorkloadMatrixRow = z.infer<typeof workloadMatrixRowSchema>;

export const inspectorWorkloadResponseSchema = z.object({
  week: z.object({
    weekStart: civilDateSchema,
    weekEnd: civilDateSchema,
    /** Monday through Sunday, so the client never re-derives the column headers. */
    days: z.array(civilDateSchema).length(WORKLOAD_WEEK_LENGTH),
  }),
  /**
   * Echoed rather than imported by the client so the legend, the cell tooltips
   * and the server's own classification can never disagree — and so making
   * thresholds configurable later changes one payload, not three call sites.
   */
  thresholds: z.object({
    weeklyBusy: z.number().int().positive(),
    weeklyOverloaded: z.number().int().positive(),
    dailyBusy: z.number().int().positive(),
    dailyOverloaded: z.number().int().positive(),
  }),
  kpis: z.object({
    totalInWeek: countSchema,
    activeInspectorCount: countSchema,
    /**
     * `null` on an empty roster so the tile renders "—" rather than NaN. The
     * denominator is the active roster, so idle inspectors dilute the average —
     * the honest reading, and the tile prints the denominator alongside.
     */
    avgPerInspector: z.number().nonnegative().nullable(),
    nearLimit: z.object({ count: countSchema, inspectors: z.array(inspectorRefSchema) }),
    overloaded: z.object({ count: countSchema, inspectors: z.array(inspectorRefSchema) }),
  }),
  funnel: z.object({
    previous: weekFunnelSchema,
    selected: weekFunnelSchema,
    next: weekFunnelSchema,
  }),
  /** Month windows resolve from the month containing the selected week's Monday. */
  completed: z.object({
    doneSelectedWeek: countSchema,
    donePreviousWeek: countSchema,
    doneSelectedMonth: countSchema,
    donePreviousMonth: countSchema,
    selectedMonth: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM required'),
    previousMonth: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM required'),
  }),
  matrix: z.object({
    inspectors: z.array(workloadMatrixRowSchema),
    teamTotalsByDay: weekDayCountsSchema,
    teamTotal: countSchema,
  }),
});

export type InspectorWorkloadResponse = z.infer<typeof inspectorWorkloadResponseSchema>;
