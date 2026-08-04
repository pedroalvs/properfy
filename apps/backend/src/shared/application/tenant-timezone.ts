/**
 * Read-side port for resolving an agency's timezone. Business rules anchored
 * to an appointment's agency (past-date validation, start gates, portal
 * cutoffs) depend on this rather than on the acting user's timezone, so two
 * actors can never disagree on whether a civil date is valid.
 */
export interface ITenantTimezoneLookup {
  /** tenants.timezone for the id, or null when unset. Callers fall back to PLATFORM_TIMEZONE. */
  getTenantTimezone(tenantId: string): Promise<string | null>;
}
