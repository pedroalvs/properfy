/**
 * Group drill-down modal — pure-helper + source-assertion guards.
 *
 * The map test harness has no Mapbox token, so markers never mount in jsdom
 * (see AppointmentMapPage.marker-click.test.tsx). So the swap logic is pinned
 * via the pure `selectGroupModePins` helper, and the page-level wiring is
 * pinned via source assertions — the same durable approach the existing
 * marker-click / popup-follow tests use.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { selectGroupModePins } from './AppointmentMapPage';

const groupPins = [
  { id: 'g1', name: 'Group 1', latitude: -33.8, longitude: 151.2 },
  { id: 'g2', name: 'Group 2', latitude: -33.9, longitude: 151.3 },
] as unknown as Parameters<typeof selectGroupModePins>[0]['groupPins'];

const groupAppointmentPins = [
  { id: 'a1', code: 'INS-0001', status: 'SCHEDULED', latitude: -33.8, longitude: 151.2 },
  { id: 'a2', code: 'INS-0002', status: 'CANCELLED', latitude: -33.9, longitude: 151.3 },
] as unknown as Parameters<typeof selectGroupModePins>[0]['groupAppointmentPins'];

describe('selectGroupModePins (pin swap)', () => {
  it('with no group selected → shows the group pins', () => {
    const result = selectGroupModePins({ selectedGroupId: null, groupPins, groupAppointmentPins });
    expect(result.kind).toBe('groups');
    expect(result.items).toBe(groupPins);
  });

  it('with a group selected → shows that group’s appointment pins (group pins hidden)', () => {
    const result = selectGroupModePins({ selectedGroupId: 'g1', groupPins, groupAppointmentPins });
    expect(result.kind).toBe('appointments');
    expect(result.items).toBe(groupAppointmentPins);
  });

  it('empty selection id is treated as no drill-down', () => {
    const result = selectGroupModePins({ selectedGroupId: '', groupPins, groupAppointmentPins });
    expect(result.kind).toBe('groups');
  });
});

const PAGE_SOURCE = readFileSync(resolve(__dirname, './AppointmentMapPage.tsx'), 'utf8');

describe('AppointmentMapPage — group drill-down wiring (source guards)', () => {
  it('fetches the drilled group’s appointments only when a group is selected', () => {
    // Query keyed by the drilled group id; disabled when none is selected.
    expect(PAGE_SOURCE).toMatch(/const drilledGroupId = mode === 'groups' \? selectedGroupItem\?\.id \?\? null : null;/);
    expect(PAGE_SOURCE).toContain("['appointments-by-group', drilledGroupId]");
    expect(PAGE_SOURCE).toContain('serviceGroupId: drilledGroupId');
    expect(PAGE_SOURCE).toMatch(/enabled: !!drilledGroupId/);
  });

  it('opens the SAME bulk modal for groups, read-only (no group-creation buttons), with a loading state', () => {
    expect(PAGE_SOURCE).toMatch(/open=\{mode === 'groups' && !!selectedGroupItem\}/);
    expect(PAGE_SOURCE).toContain('showGroupCreationActions={false}');
    expect(PAGE_SOURCE).toContain('isLoading={groupApptFetching}');
    expect(PAGE_SOURCE).toContain("resizeStorageKey=\"appointments-map.group-modal.width\"");
  });

  it('closing the group modal clears BOTH the group and appointment selections', () => {
    expect(PAGE_SOURCE).toMatch(/onClose=\{\(\) => \{ setSelectedGroupItem\(null\); setSelectedItem\(null\); \}\}/);
  });

  it('the rich detail popup is enabled in Appointments mode OR the Groups drill-down', () => {
    expect(PAGE_SOURCE).toMatch(/const appointmentDetailEnabled = mode === 'appointments' \|\| !!selectedGroupItem;/);
    // Both the popup effect and the portal render gate on it.
    expect(PAGE_SOURCE).toContain('!mapInstance || !appointmentDetailEnabled || !selectedItem');
    expect(PAGE_SOURCE).toContain('{appointmentDetailEnabled && selectedItem && appointmentPopupRoot && createPortal(');
  });

  it('the drill-down appointment-pin handler does NOT clear selectedGroupItem', () => {
    const handlerMatch = PAGE_SOURCE.match(/const handleGroupAppointmentMarkerClick = useCallback\(\(item: AppointmentMapItem\)[\s\S]*?\}, \[mapInstance, groupModalWidth\]\);/);
    expect(handlerMatch, 'handleGroupAppointmentMarkerClick not found').toBeTruthy();
    const body = handlerMatch![0];
    expect(body).toContain('setSelectedItem(item)');
    expect(body).not.toContain('setSelectedGroupItem');
  });

  it('the per-group camera fit uses its own once-per-group sentinel and right padding', () => {
    expect(PAGE_SOURCE).toContain('hasFittedGroupRef');
    expect(PAGE_SOURCE).toMatch(/hasFittedGroupRef\.current === drilledGroupId/);
    expect(PAGE_SOURCE).toMatch(/right: rightPad/);
  });

  it('the legacy screen-pixel group popup is gone', () => {
    expect(PAGE_SOURCE).not.toContain('<MapPopup');
    expect(PAGE_SOURCE).not.toContain('handleViewGroupDetail');
    expect(PAGE_SOURCE).not.toContain('popupPosition');
  });
});
