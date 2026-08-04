import { PLATFORM_TIMEZONE } from '@properfy/shared';

/**
 * Module-level display timezone for instant formatters.
 *
 * The instant formatters in `@/lib/format-date` run in render paths all over
 * the app, far from any React context. Rather than threading a timezone prop
 * through every table cell, `AuthProvider` publishes the signed-in user's
 * effective timezone here whenever the user object changes (login, hydrate,
 * refresh) and resets it to the platform default on logout.
 *
 * Components that need the timezone as a reactive value (re-render on change)
 * should use `useEffectiveTimezone` instead — this module is intentionally
 * non-reactive and exists only for the formatter wrappers.
 */

let displayTimezone: string = PLATFORM_TIMEZONE;

export function setDisplayTimezone(tz: string): void {
  displayTimezone = tz;
}

export function getDisplayTimezone(): string {
  return displayTimezone;
}
