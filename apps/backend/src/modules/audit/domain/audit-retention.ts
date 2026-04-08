/**
 * Audit log retention tiers.
 *
 * Financial actions are retained for 7 years, general actions for 5 years,
 * and high-volume read/auth-success actions for 2 years.
 */

const YEARS_IN_MS = 365.25 * 24 * 60 * 60 * 1000;

export const RETENTION_TIER = {
  FINANCIAL: 7 * YEARS_IN_MS,
  GENERAL: 5 * YEARS_IN_MS,
  HIGH_VOLUME: 2 * YEARS_IN_MS,
} as const;

/** Action prefixes/patterns classified as financial (7-year retention). */
export const FINANCIAL_ACTION_PATTERNS: string[] = [
  'financial.',
  'billing.',
  'invoice.',
  'refund.',
  'manualAdjustment.',
];

/** Exact actions classified as high-volume (2-year retention). */
export const HIGH_VOLUME_ACTIONS: Set<string> = new Set([
  'auth.loginSuccess',
  'auth.refreshToken',
  'auth.tokenVerified',
  'portal.view',
]);

/** Action prefixes classified as high-volume (2-year retention). */
export const HIGH_VOLUME_ACTION_PREFIXES: string[] = [
  'read.',
];

/**
 * Returns the retention period in milliseconds for a given audit action.
 */
export function getRetentionPeriod(action: string): number {
  // Financial tier
  for (const prefix of FINANCIAL_ACTION_PATTERNS) {
    if (action.startsWith(prefix)) {
      return RETENTION_TIER.FINANCIAL;
    }
  }

  // High-volume tier
  if (HIGH_VOLUME_ACTIONS.has(action)) {
    return RETENTION_TIER.HIGH_VOLUME;
  }
  for (const prefix of HIGH_VOLUME_ACTION_PREFIXES) {
    if (action.startsWith(prefix)) {
      return RETENTION_TIER.HIGH_VOLUME;
    }
  }

  // Default: general tier
  return RETENTION_TIER.GENERAL;
}
