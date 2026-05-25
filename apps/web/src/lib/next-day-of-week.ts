type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const DAY_INDEX: Record<DayKey, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/**
 * Returns the next occurrence of `dayOfWeek` as YYYY-MM-DD in local time.
 * Never returns today — if today matches, returns the same day next week.
 */
export function nextOccurrence(dayOfWeek: DayKey, from: Date = new Date()): string {
  const target = DAY_INDEX[dayOfWeek];
  const today = from.getDay();
  const daysUntil = ((target - today + 7) % 7) || 7;

  const result = new Date(from);
  result.setDate(from.getDate() + daysUntil);

  const y = result.getFullYear();
  const m = String(result.getMonth() + 1).padStart(2, '0');
  const d = String(result.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
