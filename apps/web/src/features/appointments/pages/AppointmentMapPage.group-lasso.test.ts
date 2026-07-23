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
    expect(PAGE_SOURCE).toMatch(/\{lassoAvailable && \(/);
    expect(PAGE_SOURCE).toContain("<MapLassoToggleButton active={lassoState !== 'idle'} onClick={handleLassoToggle} />");
    expect(PAGE_SOURCE).toMatch(/\{lassoAvailable && lassoState === 'drawing' &&/);
  });

  it('renders the lasso button left of the List view toggle in a horizontal toolbar row', () => {
    // Bound the slice to the toolbar container itself (its className — which
    // also pins the horizontal `flex items-center` layout — → the next
    // sibling component), so the assertions can't match stray duplicates
    // elsewhere in the file.
    const toolbarStart = PAGE_SOURCE.indexOf(
      'className="pointer-events-none absolute right-14 top-4 z-30 flex items-center gap-2"',
    );
    expect(toolbarStart, 'top-right toolbar container not found').toBeGreaterThan(-1);
    const toolbarEnd = PAGE_SOURCE.indexOf('<MapBulkActionModal', toolbarStart);
    expect(toolbarEnd, 'toolbar end marker not found').toBeGreaterThan(toolbarStart);
    const toolbar = PAGE_SOURCE.slice(toolbarStart, toolbarEnd);
    const lassoIdx = toolbar.indexOf('<MapLassoToggleButton');
    const listViewIdx = toolbar.indexOf('<MapListViewToggleButton');
    expect(lassoIdx, 'MapLassoToggleButton not in toolbar').toBeGreaterThan(-1);
    expect(listViewIdx, 'MapListViewToggleButton not in toolbar').toBeGreaterThan(-1);
    expect(lassoIdx).toBeLessThan(listViewIdx);
    expect(toolbar).not.toContain('flex-col');
  });

  it('in the group drill-down the lasso seeds the modal selection then drops the polygon (no review)', () => {
    // Bound the slice to the callback itself (start marker → next declaration)
    // rather than a magic char window, so it stays valid as the file grows.
    const start = PAGE_SOURCE.indexOf('const handleLassoSelectionChange');
    expect(start, 'handleLassoSelectionChange not found').toBeGreaterThan(-1);
    const end = PAGE_SOURCE.indexOf('const handleLassoToggle', start);
    expect(end, 'handleLassoToggle (callback end marker) not found').toBeGreaterThan(start);
    const handler = PAGE_SOURCE.slice(start, end);
    // Group branch short-circuits BEFORE the appointments-flow selection
    // (which starts at `setLassoSelectedIds(ids)` and later goes to 'review').
    expect(handler).toContain("if (mode === 'groups' && selectedGroupItem) {");
    expect(handler).toContain('setGroupLassoSelectedIds(ids);');
    const groupBranchIdx = handler.indexOf("if (mode === 'groups' && selectedGroupItem) {");
    const apptFlowIdx = handler.indexOf('setLassoSelectedIds(ids);');
    expect(groupBranchIdx).toBeGreaterThan(-1);
    expect(apptFlowIdx).toBeGreaterThan(groupBranchIdx);
  });

  it('models the group-lasso selection as a tri-state (null / empty / matches) and passes it uncontrolled when null', () => {
    // `null` = no completed lasso yet → the modal stays uncontrolled.
    expect(PAGE_SOURCE).toMatch(/useState<string\[\] \| null>\(null\)/);
    expect(PAGE_SOURCE).toContain('externalSelectedIds={groupLassoSelectedIds ?? undefined}');
  });

  it('fully resets the group lasso to null when the drilled group changes or the drill-down closes', () => {
    const idx = PAGE_SOURCE.indexOf('}, [mode, selectedGroupItem?.id]);');
    expect(idx, 'teardown effect not found').toBeGreaterThan(-1);
    // Anchor the region on the effect body's opening rather than a fixed window.
    const bodyStart = PAGE_SOURCE.lastIndexOf('useEffect(() => {', idx);
    expect(bodyStart, 'teardown effect body start not found').toBeGreaterThan(-1);
    const effect = PAGE_SOURCE.slice(bodyStart, idx + 40);
    expect(effect).toContain("setLassoState('idle');");
    expect(effect).toContain('setGroupLassoSelectedIds(null);');
  });

  it('disables the drill-down appointment markers while drawing (closing-click guard)', () => {
    // Bound to the drill-down marker block (its start marker → its onClick).
    const start = PAGE_SOURCE.indexOf("groupModePins.kind === 'appointments' &&");
    expect(start, 'drill-down marker block not found').toBeGreaterThan(-1);
    const end = PAGE_SOURCE.indexOf('handleGroupAppointmentMarkerClick', start);
    expect(end, 'drill-down marker onClick not found').toBeGreaterThan(start);
    const drillBlock = PAGE_SOURCE.slice(start, end);
    expect(drillBlock).toContain("disabled={lassoState === 'drawing'}");
  });
});
