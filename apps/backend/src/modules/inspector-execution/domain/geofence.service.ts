import type { GeofenceMode } from '@properfy/shared';

export type GeofenceFallbackReason = 'NO_PROPERTY_COORDINATES' | 'NO_ACCURACY' | 'POOR_ACCURACY';

export interface EvaluateGeofenceInput {
  /** Distance from the inspector to the property, metres; null when the property has no coordinates. */
  distanceMeters: number | null;
  /** GPS accuracy reported by the device, metres; null when the client sent none. */
  accuracyMeters: number | null;
  radiusMeters: number;
  mode: GeofenceMode;
}

export interface GeofenceEvaluation {
  /** Distance strictly greater than the radius (equality is inside). */
  outOfRadius: boolean;
  /** The mode actually applied after any automatic fallback. */
  effectiveMode: GeofenceMode;
  /** Why BLOCK fell back to FLAG, if it did. */
  fallbackReason: GeofenceFallbackReason | null;
  /** True only when BLOCK is in force AND the inspector is out of radius. */
  blocked: boolean;
}

/**
 * Pure geofence decision (F03, criterion 03.A2). BLOCK falls back to FLAG when the
 * measurement is unreliable, so a legitimate inspector is never stranded:
 * - no property coordinates  → NO_PROPERTY_COORDINATES
 * - no GPS accuracy          → NO_ACCURACY
 * - accuracy coarser than the radius → POOR_ACCURACY
 */
export function evaluateGeofence(input: EvaluateGeofenceInput): GeofenceEvaluation {
  const { distanceMeters, accuracyMeters, radiusMeters, mode } = input;

  const outOfRadius = distanceMeters !== null && distanceMeters > radiusMeters;

  let effectiveMode: GeofenceMode = mode;
  let fallbackReason: GeofenceFallbackReason | null = null;

  if (mode === 'BLOCK') {
    if (distanceMeters === null) {
      effectiveMode = 'FLAG';
      fallbackReason = 'NO_PROPERTY_COORDINATES';
    } else if (accuracyMeters === null) {
      effectiveMode = 'FLAG';
      fallbackReason = 'NO_ACCURACY';
    } else if (accuracyMeters > radiusMeters) {
      effectiveMode = 'FLAG';
      fallbackReason = 'POOR_ACCURACY';
    }
  }

  const blocked = effectiveMode === 'BLOCK' && outOfRadius;

  return { outOfRadius, effectiveMode, fallbackReason, blocked };
}
