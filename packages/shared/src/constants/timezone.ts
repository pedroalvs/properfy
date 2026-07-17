/**
 * The single IANA timezone all Properfy business rules are anchored to.
 * The platform is Sydney-only: cron schedules, "today" computations, past-date
 * validation and display all resolve against this zone. Storage stays UTC.
 */
export const PLATFORM_TIMEZONE = 'Australia/Sydney';
