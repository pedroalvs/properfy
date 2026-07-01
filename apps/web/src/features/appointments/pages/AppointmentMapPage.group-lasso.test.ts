/**
 * Group-modal lasso — pure-helper + source-assertion guards.
 *
 * jsdom has no Mapbox token, so the lasso/markers never mount (same constraint
 * as the group-modal + marker-click tests). The active point-set selection is
 * pinned via the pure `resolveActiveLassoPoints` helper; the page wiring
 * (availability, seed prop, teardown) is pinned via source assertions.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveActiveLassoPoints } from './AppointmentMapPage';
import type { LassoPoint } from '@/components/map/MapLassoSelect';

const appointmentPoints: LassoPoint[] = [
  { id: 'a1', longitude: 151.2, latitude: -33.8 },
  { id: 'a2', longitude: 151.3, latitude: -33.9 },
];
const groupAppointmentPoints: LassoPoint[] = [
  { id: 'g-a1', longitude: 151.21, latitude: -33.81 },
];

describe('resolveActiveLassoPoints (which pins the lasso hit-tests)', () => {
  it('uses Appointments-mode points in appointments mode', () => {
    const result = resolveActiveLassoPoints({
      mode: 'appointments', groupDrilledIn: false, appointmentPoints, groupAppointmentPoints,
    });
    expect(result).toBe(appointmentPoints);
  });

  it('uses the drilled group’s appointment points when a group is open', () => {
    const result = resolveActiveLassoPoints({
      mode: 'groups', groupDrilledIn: true, appointmentPoints, groupAppointmentPoints,
    });
    expect(result).toBe(groupAppointmentPoints);
  });

  it('falls back to Appointments-mode points in groups mode with no group drilled', () => {
    const result = resolveActiveLassoPoints({
      mode: 'groups', groupDrilledIn: false, appointmentPoints, groupAppointmentPoints,
    });
    expect(result).toBe(appointmentPoints);
  });
});

const PAGE_SOURCE = readFileSync(resolve(__dirname, './AppointmentMapPage.tsx'), 'utf8');

describe('AppointmentMapPage — group-modal lasso wiring (source guards)', () => {
  it('makes the lasso available in Appointments mode AND the Groups drill-down', () => {
    expect(PAGE_SOURCE).toMatch(/const groupLassoActive = mode === 'groups' && !!selectedGroupItem;/);
    expect(PAGE_SOURCE).toMatch(/const lassoAvailable = mode === 'appointments' \|\| groupLassoActive;/);
  });

  it('feeds the lasso the mode-aware point set and gates the draw control on availability', () => {
    expect(PAGE_SOURCE).toContain('points={activeLassoPoints}');
    expect(PAGE_SOURCE).toContain("lassoState={lassoAvailable ? lassoState : 'idle'}");
  });

  it('shows the Select Area button and drawing banner whenever the lasso is available', () => {
    expect(PAGE_SOURCE).toContain('...(lassoAvailable');
    expect(PAGE_SOURCE).toMatch(/\{lassoAvailable && lassoState === 'drawing' &&/);
  });

  it('in the group drill-down the lasso seeds the modal selection then drops the polygon (no review)', () => {
    const idx = PAGE_SOURCE.indexOf('const handleLassoSelectionChange');
    expect(idx, 'handleLassoSelectionChange not found').toBeGreaterThan(-1);
    const handlerSlice = PAGE_SOURCE.slice(idx, idx + 900);
    // Group branch short-circuits BEFORE the appointments-flow selection
    // (which starts at `setLassoSelectedIds(ids)` and later goes to 'review').
    expect(handlerSlice).toContain("if (mode === 'groups' && selectedGroupItem) {");
    expect(handlerSlice).toContain('setGroupLassoSelectedIds(ids);');
    const groupBranchIdx = handlerSlice.indexOf("if (mode === 'groups' && selectedGroupItem) {");
    const apptFlowIdx = handlerSlice.indexOf('setLassoSelectedIds(ids);');
    expect(groupBranchIdx).toBeGreaterThan(-1);
    expect(apptFlowIdx).toBeGreaterThan(groupBranchIdx);
  });

  it('passes the lasso selection to the group modal via externalSelectedIds', () => {
    expect(PAGE_SOURCE).toContain('externalSelectedIds={groupLassoSelectedIds}');
  });

  it('fully resets the group lasso when the drilled group changes or the drill-down closes', () => {
    const idx = PAGE_SOURCE.indexOf('}, [mode, selectedGroupItem?.id]);');
    expect(idx, 'teardown effect not found').toBeGreaterThan(-1);
    const slice = PAGE_SOURCE.slice(idx - 200, idx + 40);
    expect(slice).toContain("setLassoState('idle');");
    expect(slice).toContain('setGroupLassoSelectedIds([]);');
  });

  it('disables the drill-down appointment markers while drawing (closing-click guard)', () => {
    const drillIdx = PAGE_SOURCE.indexOf("groupModePins.kind === 'appointments' &&");
    expect(drillIdx, 'drill-down marker block not found').toBeGreaterThan(-1);
    const drillBlock = PAGE_SOURCE.slice(drillIdx, drillIdx + 700);
    expect(drillBlock).toContain("disabled={lassoState === 'drawing'}");
    expect(drillBlock).toContain('handleGroupAppointmentMarkerClick');
  });
});
