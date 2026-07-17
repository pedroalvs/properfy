import { GeocodingStatus } from '@properfy/shared';
import type { GeocodeVerification } from '@properfy/shared';

/**
 * Maps a preview-time geocode verification onto the property geocoding
 * status vocabulary so import previews can reuse `GeocodingStatusBadge`:
 * `found` → SUCCESS, `not_found` → FAILED, `unverified` → PENDING (it will
 * finish via the async geocode job after commit). `null` (existing property
 * or not verified at all) renders no badge.
 */
export function geocodeVerificationToStatus(
  verification: GeocodeVerification | null | undefined,
): GeocodingStatus | null {
  if (!verification) return null;
  switch (verification.status) {
    case 'found':
      return GeocodingStatus.SUCCESS;
    case 'not_found':
      return GeocodingStatus.FAILED;
    default:
      return GeocodingStatus.PENDING;
  }
}
