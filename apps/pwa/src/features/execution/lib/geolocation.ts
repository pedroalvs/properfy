import type { CapturedLocation } from '../types';

/**
 * One-shot location capture for the card's check-in / check-out (which need a
 * location before calling the server). Unlike `useGeolocation` (state-based, for
 * the execution panels) this is promise-based: it resolves a `CapturedLocation`
 * or rejects, so the caller can gate the action on a successful fix. Location is
 * mandatory for check-in/out, so any failure (denied, unavailable, timeout) is a
 * rejection — the caller tells the inspector to enable location and try again.
 */
export function captureRequiredLocation(timeoutMs = 15000): Promise<CapturedLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not available'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
