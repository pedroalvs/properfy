/**
 * Service-group constants shared across workspaces.
 */

/**
 * Local wall-clock cutoff (Sydney) after which a group scheduled for the CURRENT
 * day is no longer offered as a "move" destination.
 *
 * Moving an appointment into today's group is a last-minute operational action; it
 * must happen before the day's routes lock for the evening (the 19:00 T-1 sweep and
 * the 19:30 day-plan publication). 18:50 is the agreed gate — future-dated groups
 * are always movable, today's only before this time. Minute-granular, so it is
 * compared via `zonedWallTimeToUtc(today, GROUP_MOVE_SAME_DAY_CUTOFF_LOCAL_TIME,
 * PLATFORM_TIMEZONE)`, not the hour-granular `hourInTimezone` sweeps use.
 */
export const GROUP_MOVE_SAME_DAY_CUTOFF_LOCAL_TIME = '18:50';
