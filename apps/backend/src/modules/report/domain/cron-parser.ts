/**
 * Minimal cron expression parser for scheduled reports.
 *
 * Supports standard 5-field cron expressions: minute hour day-of-month month day-of-week
 *
 * Supported patterns per field:
 * - Literal number (e.g. "0", "8")
 * - Wildcard "*"
 * - Step "* /N" (every N units, e.g. "* /15")
 * - Range "A-B" (inclusive)
 * - List "A,B,C"
 *
 * This is intentionally simple. For production use with complex cron expressions,
 * consider replacing with the `cron-parser` npm package.
 */

const FIELD_RANGES: [number, number][] = [
  [0, 59],   // minute
  [0, 23],   // hour
  [1, 31],   // day of month
  [1, 12],   // month
  [0, 6],    // day of week (0 = Sunday)
];

const FIELD_NAMES = ['minute', 'hour', 'day-of-month', 'month', 'day-of-week'];

function parseField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const trimmed = part.trim();

    // Step pattern: */N or N-M/S
    if (trimmed.includes('/')) {
      const [rangePart, stepStr] = trimmed.split('/');
      const step = parseInt(stepStr!, 10);
      if (isNaN(step) || step < 1) {
        throw new Error(`Invalid step value: ${stepStr}`);
      }
      let rangeMin = min;
      let rangeMax = max;
      if (rangePart !== '*') {
        if (rangePart!.includes('-')) {
          const [a, b] = rangePart!.split('-').map(Number);
          rangeMin = a!;
          rangeMax = b!;
        } else {
          rangeMin = parseInt(rangePart!, 10);
        }
      }
      for (let i = rangeMin; i <= rangeMax; i += step) {
        values.add(i);
      }
      continue;
    }

    // Range pattern: A-B
    if (trimmed.includes('-')) {
      const [a, b] = trimmed.split('-').map(Number);
      for (let i = a!; i <= b!; i++) {
        values.add(i);
      }
      continue;
    }

    // Wildcard
    if (trimmed === '*') {
      for (let i = min; i <= max; i++) {
        values.add(i);
      }
      continue;
    }

    // Literal number
    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < min || num > max) {
      throw new Error(`Invalid cron value: ${trimmed} (expected ${min}-${max})`);
    }
    values.add(num);
  }

  return Array.from(values).sort((a, b) => a - b);
}

export interface ParsedCron {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

/**
 * Validate and parse a 5-field cron expression.
 * Throws an Error if the expression is invalid.
 */
export function parseCronExpression(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got ${fields.length}`);
  }

  const parsed: number[][] = [];
  for (let i = 0; i < 5; i++) {
    try {
      parsed.push(parseField(fields[i]!, FIELD_RANGES[i]![0], FIELD_RANGES[i]![1]));
    } catch (err) {
      throw new Error(`Invalid ${FIELD_NAMES[i]} field: ${(err as Error).message}`);
    }
  }

  return {
    minutes: parsed[0]!,
    hours: parsed[1]!,
    daysOfMonth: parsed[2]!,
    months: parsed[3]!,
    daysOfWeek: parsed[4]!,
  };
}

/**
 * Validate a cron expression. Returns true if valid, false otherwise.
 */
export function isValidCronExpression(expression: string): boolean {
  try {
    parseCronExpression(expression);
    return true;
  } catch {
    return false;
  }
}

/**
 * Feature 019: map a structured recurrence (daily / weekly / monthly) onto a
 * 5-field cron expression. This is the canonical conversion used by the
 * scheduled-report create/update use cases. Keeping cron as the storage format
 * means the existing parser, next-run computation, and legacy call sites stay
 * unchanged.
 */
export type StructuredRecurrenceInput =
  | { type: 'daily'; hour: number }
  | { type: 'weekly'; dayOfWeek: number; hour: number }
  | { type: 'monthly'; dayOfMonth: number; hour: number };

export function recurrenceToCron(recurrence: StructuredRecurrenceInput): string {
  switch (recurrence.type) {
    case 'daily':
      // `0 HH * * *`
      return `0 ${recurrence.hour} * * *`;
    case 'weekly':
      // `0 HH * * D`
      return `0 ${recurrence.hour} * * ${recurrence.dayOfWeek}`;
    case 'monthly':
      // `0 HH D * *`
      return `0 ${recurrence.hour} ${recurrence.dayOfMonth} * *`;
  }
}

/**
 * Compute the most recent cron tick at or before `before`. Used by the schedule
 * worker to compute `scheduled_for` for catch-up run ledger rows.
 */
export function getPreviousRunTime(expression: string, before: Date): Date | null {
  const cron = parseCronExpression(expression);
  const cursor = new Date(before);
  cursor.setSeconds(0, 0);

  const limit = new Date(before);
  limit.setDate(limit.getDate() - 366);

  while (cursor > limit) {
    const month = cursor.getMonth() + 1;
    const dayOfMonth = cursor.getDate();
    const dayOfWeek = cursor.getDay();
    const hour = cursor.getHours();
    const minute = cursor.getMinutes();

    if (
      cron.months.includes(month) &&
      cron.daysOfMonth.includes(dayOfMonth) &&
      cron.daysOfWeek.includes(dayOfWeek) &&
      cron.hours.includes(hour) &&
      cron.minutes.includes(minute)
    ) {
      return new Date(cursor);
    }

    cursor.setMinutes(cursor.getMinutes() - 1);
  }

  return null;
}

/**
 * Compute the next run time after `after` for the given cron expression.
 * Searches forward up to 366 days. Returns null if no match is found.
 */
export function getNextRunTime(expression: string, after: Date): Date | null {
  const cron = parseCronExpression(expression);

  // Start from the next whole minute after `after`
  const cursor = new Date(after);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const limit = new Date(after);
  limit.setDate(limit.getDate() + 366);

  while (cursor < limit) {
    const month = cursor.getMonth() + 1; // 1-based
    const dayOfMonth = cursor.getDate();
    const dayOfWeek = cursor.getDay(); // 0 = Sunday
    const hour = cursor.getHours();
    const minute = cursor.getMinutes();

    if (
      cron.months.includes(month) &&
      cron.daysOfMonth.includes(dayOfMonth) &&
      cron.daysOfWeek.includes(dayOfWeek) &&
      cron.hours.includes(hour) &&
      cron.minutes.includes(minute)
    ) {
      return new Date(cursor);
    }

    // Advance by one minute
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}
