/**
 * Tenant arrival-notice constants (F06). These are **decisions**, not
 * platform-configurable values — the configurable knobs live in the
 * `tenantEtaNotices` PlatformSetting key.
 */

/** ETA band half-width: the estimate is shown as a ±30-minute range (F06 D4). */
export const TENANT_ETA_BAND_HALF_WIDTH_MINUTES = 30;

/** "On the way" is only sent when projected arrival is within 60 min (L-F06-01). */
export const TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES = 60;

/** A projection ≥ 30 min earlier than the morning band triggers one correction (L-F06-05). */
export const TENANT_ETA_EARLY_CHANGE_MINUTES = 30;

/** Above this many TENANT_ETA_* SMS on a platform day, log a volume warning (L-F06-11). */
export const TENANT_ETA_DAILY_SMS_WARN_THRESHOLD = 500;
