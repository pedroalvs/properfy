/**
 * Service-type per-stop duration bounds (F04, D6). The day-plan optimizer adds
 * this duration to travel time at each stop. NOT NULL in the database with a
 * constant default; the web form makes it required in TASK-F04-5 (hence the
 * transitional `.default(...)` in `createServiceTypeSchema`).
 */
export const SERVICE_TYPE_DURATION_MIN_MINUTES = 5;
export const SERVICE_TYPE_DURATION_MAX_MINUTES = 480;
export const SERVICE_TYPE_DURATION_DEFAULT_MINUTES = 45;
