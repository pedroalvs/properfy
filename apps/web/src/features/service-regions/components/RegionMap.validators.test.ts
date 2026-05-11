/**
 * Issue #1 (UX smoke) anti-regression — Mapbox's `LngLat` constructor
 * rejects out-of-range values with "Invalid LngLat latitude value: must
 * be between -90 and 90", surfacing as "Unexpected Application Error"
 * on /service-regions. Pre-fix the deriveCenter computation passed
 * the raw average through to `new mapboxgl.Map({ center })`, so a
 * single bad row crashed the route.
 *
 * The fix lives in three guards exported from RegionMap.tsx
 * (`isValidLng`, `isValidLat`, `isValidLngLat`). The integration
 * surface (the component using these to fall back to DEFAULT_CENTER)
 * is exercised in browser smoke; this file pins the boundary logic.
 */

import { describe, it, expect } from 'vitest';
import { isValidLng, isValidLat, isValidLngLat } from './RegionMap';

describe('isValidLat', () => {
  it.each([0, -90, 90, -33.8688, 89.999999])(
    'accepts in-range latitude %s',
    (v) => expect(isValidLat(v)).toBe(true),
  );

  it.each([91, -91, 180, -180, 200, NaN, Infinity, -Infinity])(
    'rejects out-of-range / non-finite latitude %s',
    (v) => expect(isValidLat(v)).toBe(false),
  );

  it.each([undefined, null, '0', '', {}])(
    'rejects non-number latitude %s',
    (v) => expect(isValidLat(v)).toBe(false),
  );
});

describe('isValidLng', () => {
  it.each([0, -180, 180, 151.2093, 179.999999])(
    'accepts in-range longitude %s',
    (v) => expect(isValidLng(v)).toBe(true),
  );

  it.each([181, -181, 360, NaN, Infinity, -Infinity])(
    'rejects out-of-range / non-finite longitude %s',
    (v) => expect(isValidLng(v)).toBe(false),
  );

  it.each([undefined, null, '0', '', {}])(
    'rejects non-number longitude %s',
    (v) => expect(isValidLng(v)).toBe(false),
  );
});

describe('isValidLngLat (paired guard)', () => {
  it('accepts a Sydney-area pair', () => {
    expect(isValidLngLat([151.21, -33.87])).toBe(true);
  });

  it('rejects when the latitude exceeds 90 (the smoke-caught bug)', () => {
    // Pre-fix, a row with [lat, lng] stored in swapped order produced
    // an average like [-33.87, 151.21] — first slot is lat-ish, the
    // second is the 151.21 longitude pretending to be a latitude.
    // Mapbox crashed; this guard catches it.
    expect(isValidLngLat([-33.87, 151.21])).toBe(false);
  });

  it('rejects when the longitude exceeds 180', () => {
    expect(isValidLngLat([200, 0])).toBe(false);
  });

  it('rejects NaN in either slot', () => {
    expect(isValidLngLat([NaN, 0])).toBe(false);
    expect(isValidLngLat([0, NaN])).toBe(false);
  });
});
