/**
 * TanStack Query keys for the inspector day plan. `all` is the invalidation
 * prefix shared by check-in/out, field events, the offline-queue sync and the
 * SW `inspector-notice:received` message; `byDate` keys one civil date.
 */
export const dayPlanKeys = {
  all: ['inspector', 'day-plan'] as const,
  byDate: (date: string) => ['inspector', 'day-plan', date] as const,
};
