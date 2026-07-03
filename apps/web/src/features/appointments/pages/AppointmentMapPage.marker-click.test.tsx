/**
 * 025 round-2 regression — Issue #1
 *
 * User smoke reported: "quando clico em um pin de appointment no mapa
 * da zoom out, mais especificamente fica como no início, como se ficasse
 * no centro de todos os appointments do mapa na tela."
 *
 * Root cause: the auto-fit useEffect was re-firing on every
 * `appointmentData` reference change (react-query refetch on focus,
 * filter tweaks, invalidations). After the marker click `flyTo` zoomed
 * in, a subsequent auto-fit `fitBounds(allPins)` zoomed back out.
 *
 * Fix: the auto-fit now runs ONCE per (mode, map-instance) pair using a
 * `hasFittedRef`. The "Re-center" floating action remains the explicit
 * way to refit the camera; the auto behaviour stays out of the way of
 * any marker selection.
 *
 * This test reads the page source to assert the regression guard is in
 * place — a behavioural test would need a full Mapbox runtime which is
 * impractical in jsdom, but the static guard is concrete and durable.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE_SOURCE = readFileSync(
  resolve(__dirname, './AppointmentMapPage.tsx'),
  'utf8',
);

describe('AppointmentMapPage — marker-click regression (Issue #1)', () => {
  it('the shared flyToPoint helper uses flyTo with Math.max(getZoom(), minZoom) — never fitBounds', () => {
    // Marker handlers now share a single camera helper. The guard moves with
    // it: flyTo + never-reduce-zoom semantics, and no fitBounds (which always
    // zooms back out to the full pin collection — the smoke-reported bug).
    const helperMatch = PAGE_SOURCE.match(/function flyToPoint\([\s\S]*?\n\}/);
    expect(helperMatch, 'flyToPoint helper not found').toBeTruthy();
    const body = helperMatch![0];
    expect(body).toContain('map.flyTo');
    expect(body).toContain('Math.max(map.getZoom(), opts.minZoom)');
    expect(body).not.toMatch(/fitBounds/);
  });

  it('handleMarkerClick delegates the camera move to flyToPoint with minZoom 14', () => {
    const handlerMatch = PAGE_SOURCE.match(/const handleMarkerClick = useCallback\(\(item: AppointmentMapItem\)[\s\S]*?\}, \[mapInstance\]\);/);
    expect(handlerMatch, 'handleMarkerClick definition not found').toBeTruthy();
    const body = handlerMatch![0];
    expect(body).toContain('flyToPoint(mapInstance, item, { minZoom: 14');
    expect(body).not.toMatch(/mapInstance\.fitBounds/);
  });

  it('handleGroupMarkerClick delegates to flyToPoint (NOT fitBounds) for the same reason', () => {
    const handlerMatch = PAGE_SOURCE.match(/const handleGroupMarkerClick = useCallback\(\(item: ServiceGroupMapPin\)[\s\S]*?\}, \[mapInstance\]\);/);
    expect(handlerMatch, 'handleGroupMarkerClick definition not found').toBeTruthy();
    const body = handlerMatch![0];
    expect(body).toContain('flyToPoint(mapInstance, item, { minZoom: 14');
    expect(body).not.toMatch(/mapInstance\.fitBounds/);
  });

  it('single click on a group pin previews (setPreviewGroup) without entering the drill-down', () => {
    const handlerMatch = PAGE_SOURCE.match(/const handleGroupMarkerClick = useCallback\(\(item: ServiceGroupMapPin\)[\s\S]*?\}, \[mapInstance\]\);/);
    expect(handlerMatch, 'handleGroupMarkerClick definition not found').toBeTruthy();
    const body = handlerMatch![0];
    expect(body).toContain('setPreviewGroup(item)');
    // The drill-down trigger must NOT fire on single click.
    expect(body).not.toContain('setSelectedGroupItem(item)');
  });

  it('double click on a group pin enters the drill-down (setSelectedGroupItem)', () => {
    const handlerMatch = PAGE_SOURCE.match(/const handleGroupMarkerDoubleClick = useCallback\(\(item: ServiceGroupMapPin\)[\s\S]*?\}, \[mapInstance\]\);/);
    expect(handlerMatch, 'handleGroupMarkerDoubleClick definition not found').toBeTruthy();
    const body = handlerMatch![0];
    expect(body).toContain('setSelectedGroupItem(item)');
    expect(body).toContain('setPreviewGroup(null)');
    // Group markers must wire both gestures.
    expect(PAGE_SOURCE).toContain('onDoubleClick={() => handleGroupMarkerDoubleClick(item)}');
  });

  it('auto-fit useEffect gates on the hasFittedRef sentinel to prevent re-fire', () => {
    // The auto-fit must early-return when the (mode, map) pair has
    // already been fitted; without that guard, the effect re-fires on
    // every appointmentData reference change and zooms back out.
    expect(PAGE_SOURCE).toContain('hasFittedRef');
    expect(PAGE_SOURCE).toMatch(/hasFittedRef\.current\.mode === mode && hasFittedRef\.current\.map === mapInstance/);
  });

  it('hasFittedRef is reset on mode change so the new mode fits once', () => {
    expect(PAGE_SOURCE).toMatch(/hasFittedRef\.current = \{ mode: null, map: null \};[\s\S]*?\}, \[mode\]\)/);
  });
});
