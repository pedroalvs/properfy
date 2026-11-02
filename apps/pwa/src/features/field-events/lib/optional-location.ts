/**
 * Position fields shared by the field-event request bodies (optional; latitude
 * and longitude are sent together). `clientOccurredAt` is the capture instant.
 */
export interface OptionalPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  clientOccurredAt: string;
}

/**
 * Try to capture the device position without blocking the report. A field event
 * ("Can't do this job" / "Running late") should still send if the fix is slow or
 * denied, so this resolves `null` on timeout, denial or any error — never rejects.
 */
export function captureOptionalLocation(timeoutMs = 5000): Promise<OptionalPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: OptionalPosition | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        finish({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          clientOccurredAt: new Date().toISOString(),
        });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
