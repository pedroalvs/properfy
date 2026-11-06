import type { LiveDayThresholdSource } from '@properfy/shared';

/**
 * Effective alert thresholds (§5): each field is the inspector override when set,
 * else the platform default, with the source reported per field (L-F05-01). The
 * override is `inspectors.alert_overrides_json`, written by the alert-thresholds PUT
 * as `{ delayMinutes, notStartedMinutes }` (each an int 5–240 or null = "use the
 * platform default for that field"). Parsed defensively here — a malformed or
 * out-of-range stored value falls back to the platform default.
 */

export interface EffectiveThresholds {
  delayMinutes: number;
  delaySource: LiveDayThresholdSource;
  notStartedMinutes: number;
  notStartedSource: LiveDayThresholdSource;
}

export interface AlertOverride {
  delayMinutes: number | null;
  notStartedMinutes: number | null;
}

function overrideField(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 5 && value <= 240
    ? value
    : null;
}

/** Parse the stored `alert_overrides_json` into a validated override, or an empty one. */
export function parseAlertOverride(json: unknown): AlertOverride {
  if (json === null || typeof json !== 'object') {
    return { delayMinutes: null, notStartedMinutes: null };
  }
  const obj = json as Record<string, unknown>;
  return {
    delayMinutes: overrideField(obj.delayMinutes),
    notStartedMinutes: overrideField(obj.notStartedMinutes),
  };
}

export function resolveEffectiveThresholds(
  override: AlertOverride,
  platform: { delayMinutes: number; notStartedMinutes: number },
): EffectiveThresholds {
  return {
    delayMinutes: override.delayMinutes ?? platform.delayMinutes,
    delaySource: override.delayMinutes !== null ? 'INSPECTOR' : 'PLATFORM',
    notStartedMinutes: override.notStartedMinutes ?? platform.notStartedMinutes,
    notStartedSource: override.notStartedMinutes !== null ? 'INSPECTOR' : 'PLATFORM',
  };
}
