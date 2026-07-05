/** Formats a date as the UTC month key `YYYY-MM` used by earnings summaries. */
export function formatMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
