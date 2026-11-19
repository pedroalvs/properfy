/**
 * Mask inspector/property coordinates in an audit `metadataJson` read by an
 * agency (`CL_*`) role (F03, D10). Replaces the value of any coordinate key —
 * at any depth, inside arrays too — with `'[MASKED]'`, leaving non-coordinate
 * values (e.g. `distanceMeters`) intact. Pure and non-mutating.
 *
 * New F03 audits store no coordinates; this masks the legacy audits
 * (`inspection.started`, `inspection.finished`, START `geolocation_mismatch`)
 * that still do. Features that later store coordinates under one of these key
 * names inherit the mask for free.
 */
const COORDINATE_KEYS = new Set([
  'latitude',
  'longitude',
  'inspectorLatitude',
  'inspectorLongitude',
  'startLatitude',
  'startLongitude',
  'finishLatitude',
  'finishLongitude',
  'propertyLatitude',
  'propertyLongitude',
]);

const MASK = '[MASKED]';

export function maskCoordinateKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskCoordinateKeys(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = COORDINATE_KEYS.has(key) ? MASK : maskCoordinateKeys(val);
    }
    return out;
  }
  return value;
}
