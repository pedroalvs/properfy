/**
 * Per-agency "send arrival-time notices?" flag (F06, L-F06-06).
 *
 * `tenants.settings_json.tenantEtaNoticesEnabled` has three wire states — `true`,
 * `false` and **absent** — and absent reads as ENABLED, matching
 * `tenantSettingsSchema`'s default (same fail-open idiom as
 * `isRentalTenantNotificationsEnabled`). This flag gates ONLY the `TENANT_ETA_*`
 * notices; it is independent of the general rental-tenant switch, which the
 * TASK-F06-2 notifier checks separately and first.
 */

/** The settings key, so the string literal has one definition. */
export const TENANT_ETA_NOTICES_SETTING_KEY = 'tenantEtaNoticesEnabled';

/**
 * True when the agency still wants arrival-time notices. Accepts the raw
 * settings blob (or null/undefined) so callers need not guard it: a row
 * persisted before the key existed carries no value and must read as enabled.
 */
export function isTenantEtaNoticesEnabled(
  settings: Record<string, unknown> | null | undefined,
): boolean {
  return settings?.[TENANT_ETA_NOTICES_SETTING_KEY] !== false;
}
