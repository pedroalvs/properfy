/**
 * Single owner of the per-agency "contact the rental tenant?" tri-state.
 *
 * `tenants.settings_json.rentalTenantNotificationsEnabled` has three states on the wire —
 * `true`, `false`, and **absent** — and absent must read as ENABLED, matching
 * `tenantSettingsSchema`'s default and leaving agencies that never touched the setting
 * unaffected. Getting that backwards in either direction is a silent, high-blast-radius
 * bug: read absent as disabled and every agency stops contacting its tenants; compare
 * with `=== true` and a migrated agency starts contacting them again.
 *
 * The idiom was hand-written at seven read sites across backend and web before this
 * existed. Route every new read through here.
 */

/** The settings key, so the string literal has one definition. */
export const RENTAL_TENANT_NOTIFICATIONS_SETTING_KEY = 'rentalTenantNotificationsEnabled';

/**
 * Error code returned (409) when an operator explicitly asks to notify a rental tenant
 * whose agency has opted out. Shared because it is thrown in the backend, duck-typed by
 * two batch callers, and matched by the web detail page — four spellings of one string.
 */
export const TENANT_NOTIFICATIONS_BLOCKED_CODE = 'TENANT_NOTIFICATIONS_BLOCKED';

/**
 * True when the agency still lets the platform contact its rental tenants.
 *
 * Accepts the raw settings blob (or null/undefined), so callers do not have to guard the
 * blob themselves — a tenant row persisted before the column had a default carries no
 * settings at all, and an unguarded read there is a 500.
 */
export function isRentalTenantNotificationsEnabled(
  settings: Record<string, unknown> | null | undefined,
): boolean {
  return settings?.[RENTAL_TENANT_NOTIFICATIONS_SETTING_KEY] !== false;
}
