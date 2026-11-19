/**
 * TanStack Query keys for the inspector day plan. `all` is the invalidation
 * prefix shared by check-in/out, field events, the offline-queue sync and the
 * SW `inspector-notice:received` message; `byDate` keys one civil date.
 */
export const dayPlanKeys = {
  all: ['inspector', 'day-plan'] as const,
  byDate: (date: string) => ['inspector', 'day-plan', date] as const,
  /**
   * Keys a server-side reorder preview (F04 Plan B). Order-sensitive and
   * version-pinned so React Query caches each evaluated order independently and
   * the suggested-order preview is fetched at most once per plan version.
   */
  orderPreview: (date: string, version: number, order: readonly string[]) =>
    ['inspector', 'day-plan', date, 'order-preview', version, order.join(',')] as const,
};
