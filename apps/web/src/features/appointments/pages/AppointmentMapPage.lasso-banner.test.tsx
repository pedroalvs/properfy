/**
 * 025 cycle 2/2 — Issue A regression guard
 *
 * User smoke: "ainda não estou conseguindo fechar o laço". Root cause:
 * mapbox-gl-draw v1.5 only closes a polygon via click-on-first-vertex
 * (~5px target — undiscoverable), double-click, or Enter. The map UI
 * gave the operator no visible affordance, so they kept single-clicking
 * (which just adds vertices).
 *
 * Fix: render a top-center banner over the map while `lassoState === 'drawing'`
 * with explicit `Finish` and `Cancel` buttons plus keyboard-shortcut
 * guidance. The buttons drive the imperative API exposed by
 * `MapLassoSelect.forwardRef` so the close gesture is page-discoverable.
 *
 * These page-source asserts pin the regression guard durably — a
 * future refactor that removes the banner will fail this test before
 * the user notices.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE_SOURCE = readFileSync(
  resolve(__dirname, './AppointmentMapPage.tsx'),
  'utf8',
);

describe('AppointmentMapPage — lasso draw affordance (Issue A re-fix)', () => {
  it('renders the lasso-draw banner only while lassoState === drawing', () => {
    // The banner JSX must be guarded by `lassoState === 'drawing'` AND
    // `mode === 'appointments'` so it never bleeds into groups mode.
    expect(PAGE_SOURCE).toMatch(/mode === 'appointments' && lassoState === 'drawing'/);
    expect(PAGE_SOURCE).toMatch(/data-testid="lasso-draw-banner"/);
  });

  it('banner exposes Finish and Cancel buttons', () => {
    expect(PAGE_SOURCE).toMatch(/data-testid="lasso-banner-finish"/);
    expect(PAGE_SOURCE).toMatch(/data-testid="lasso-banner-cancel"/);
  });

  it('Finish button drives the imperative finishDrawing()', () => {
    expect(PAGE_SOURCE).toMatch(/lassoRef\.current\?\.finishDrawing\(\)/);
  });

  it('Cancel button drives the imperative cancelDrawing()', () => {
    expect(PAGE_SOURCE).toMatch(/lassoRef\.current\?\.cancelDrawing\(\)/);
  });

  it('keyboard hints mention Enter and Esc', () => {
    // The user-facing guidance must surface BOTH shortcuts so the
    // operator can use either. The earlier rounds had no banner so the
    // user had no way to discover these gestures.
    expect(PAGE_SOURCE).toMatch(/Enter/);
    expect(PAGE_SOURCE).toMatch(/Esc/);
  });

  it('MapLassoSelect receives the forwardRef so the page can drive it', () => {
    expect(PAGE_SOURCE).toMatch(/<MapLassoSelect[\s\S]*?ref=\{lassoRef\}/);
  });
});
