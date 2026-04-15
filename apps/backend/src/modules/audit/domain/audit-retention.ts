/**
 * Audit log retention tiers.
 *
 * Financial actions are retained for 7 years (Operational-Critical tier),
 * general operational actions for 5 years, and high-volume read/auth-success
 * actions for 2 years (Operational-General tier).
 *
 * Feature 020 adds a DB-backed registry (`AuditRetentionCategoryConfig`) that
 * overrides these hardcoded constants at runtime. The constants remain as
 * fallback (used by unit tests, bootstrap paths, and the category classifier
 * when the DB registry is unavailable).
 */

import type { AuditRetentionCategory } from '@properfy/shared';

const YEARS_IN_MS = 365.25 * 24 * 60 * 60 * 1000;

export const RETENTION_TIER = {
  FINANCIAL: 7 * YEARS_IN_MS,
  GENERAL: 5 * YEARS_IN_MS,
  HIGH_VOLUME: 2 * YEARS_IN_MS,
} as const;

/**
 * Feature 020 minimum retention constraints. The upsert-retention-category
 * use case rejects any attempt to lower a category below these floors.
 */
export const CATEGORY_MINIMUM_YEARS: Record<AuditRetentionCategory, number> = {
  FINANCIAL: 7,
  OPERATIONAL_CRITICAL: 5,
  OPERATIONAL_GENERAL: 2,
};

/**
 * Feature 020: maps an audit `action` code to its retention category.
 *
 * Order of precedence:
 *   1. Financial patterns (`financial.`, `billing.`, `invoice.`, `refund.`, `manualAdjustment.`) → FINANCIAL
 *   2. High-volume exact actions + `read.` prefix → OPERATIONAL_GENERAL
 *   3. Everything else → OPERATIONAL_CRITICAL (safest middle tier per FR-002)
 */
export function getCategoryForAction(action: string): AuditRetentionCategory {
  for (const prefix of FINANCIAL_ACTION_PATTERNS) {
    if (action.startsWith(prefix)) {
      return 'FINANCIAL';
    }
  }

  if (HIGH_VOLUME_ACTIONS.has(action)) {
    return 'OPERATIONAL_GENERAL';
  }
  for (const prefix of HIGH_VOLUME_ACTION_PREFIXES) {
    if (action.startsWith(prefix)) {
      return 'OPERATIONAL_GENERAL';
    }
  }

  return 'OPERATIONAL_CRITICAL';
}

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
