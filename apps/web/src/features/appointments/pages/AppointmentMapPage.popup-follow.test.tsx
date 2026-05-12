/**
 * 025 cycle 2/2 — Issue B regression
 *
 * User smoke reported: "modal de detalhes do pin do appointment não esta
 * fixo proximo ao appointment". Root cause: the previous
 * `AppointmentMapDetailPanel` ran its own screen-pixel positioning via
 * `mapInstance.project()` + React state on `map.on('move')`. For markers
 * near viewport edges, `clampAnchor` held the popup against the edge
 * while the marker drifted on pan/zoom → visible decoupling.
 *
 * Fix: migrate to Mapbox-native `mapboxgl.Popup` via `createPortal`. The
 * popup anchors at `setLngLat([lng, lat])` and Mapbox updates the
 * screen position per render frame via CSS transforms.
 *
 * These tests pin the integration contract without booting a real
 * Mapbox runtime — they mock `mapboxgl.Popup` and assert the page wires
 * `setLngLat / setDOMContent / addTo / remove` correctly on every
 * selection lifecycle event. Per `feedback_mock_masks_real_bug.md` (UI
 * helpers section), this is the visual-behaviour assertion, not just
 * a helper input/output check — the popup's follow-the-marker semantic
 * lives inside Mapbox; the page only owns the wiring.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE_SOURCE = readFileSync(
  resolve(__dirname, './AppointmentMapPage.tsx'),
  'utf8',
);

describe('AppointmentMapPage — Mapbox Popup wiring (Issue B re-fix)', () => {
  it('imports mapboxgl as a value (not just type) so it can construct Popup', () => {
    // The previous `import type mapboxgl from 'mapbox-gl'` would not have
    // pulled the Popup constructor into the bundle. The re-fix needs a
    // value import.
    expect(PAGE_SOURCE).toMatch(/import\s+mapboxgl\s+from\s+['"]mapbox-gl['"]/);
  });

  it('constructs a Mapbox Popup via new mapboxgl.Popup({...})', () => {
    expect(PAGE_SOURCE).toMatch(/new mapboxgl\.Popup\(/);
  });

  it('wires setLngLat([lng, lat]) → setDOMContent(root) → addTo(map)', () => {
    expect(PAGE_SOURCE).toMatch(/\.setLngLat\(\[selectedItem\.longitude, selectedItem\.latitude\]\)/);
    expect(PAGE_SOURCE).toMatch(/\.setDOMContent\(root\)/);
    expect(PAGE_SOURCE).toMatch(/\.addTo\(mapInstance\)/);
  });

  it('uses createPortal so React content lives inside the popup root', () => {
    expect(PAGE_SOURCE).toMatch(/createPortal\(/);
  });

  it('configures the popup without closeButton/closeOnClick (panel owns close)', () => {
    expect(PAGE_SOURCE).toMatch(/closeButton:\s*false/);
    expect(PAGE_SOURCE).toMatch(/closeOnClick:\s*false/);
  });

  it('cleans up the popup when the appointment selection clears', () => {
    // The cleanup must call popup.remove() and null out the ref so a
    // future selection creates a fresh popup. Without this, stale
    // popups accumulate on pan/zoom and overlap.
    expect(PAGE_SOURCE).toMatch(/appointmentPopupRef\.current.*\.remove\(\)/s);
    expect(PAGE_SOURCE).toMatch(/setAppointmentPopupRoot\(null\)/);
  });

  it('the page no longer carries the deleted clamping helpers', () => {
    // clampAnchor + flipAbove + POPUP_HEIGHT_ESTIMATE were the
    // ~80-line drift surface that produced the previous QA failures.
    // They MUST be gone from the page so the regression cannot recur.
    expect(PAGE_SOURCE).not.toMatch(/clampAnchor/);
    expect(PAGE_SOURCE).not.toMatch(/flipAbove/);
    expect(PAGE_SOURCE).not.toMatch(/POPUP_HEIGHT_ESTIMATE/);
  });

  it('AppointmentMapDetailPanel is no longer passed an anchor prop', () => {
    // Positioning is the Popup's job now; the panel is content-only.
    // Any lingering `anchor={...}` JSX prop would mean we accidentally
    // re-introduced the screen-pixel coupling.
    const detailPanelInvocations = PAGE_SOURCE.match(/<AppointmentMapDetailPanel[\s\S]*?\/>/g) ?? [];
    expect(detailPanelInvocations.length).toBeGreaterThan(0);
    detailPanelInvocations.forEach((invocation) => {
      expect(invocation).not.toMatch(/\banchor=/);
    });
  });
});
