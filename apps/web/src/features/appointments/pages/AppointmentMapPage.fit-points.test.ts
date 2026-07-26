/**
 * Pressing Enter in a filter text field frames the current results. Which pins
 * "the current results" means depends on the mode and on whether a group is
 * drilled into — exactly the same three-way split `selectGroupModePins` makes
 * for markers. Pinned here as a pure helper so the choice is testable without a
 * live Mapbox instance.
 */

import { describe, it, expect } from 'vitest';
import { selectFitPoints } from './AppointmentMapPage';

const APPOINTMENT_PINS = [{ latitude: -33.86, longitude: 151.2 }];
const GROUP_PINS = [{ latitude: -37.81, longitude: 144.96 }];
const GROUP_APPOINTMENT_PINS = [{ latitude: -27.47, longitude: 153.02 }];

const base = {
  appointmentPins: APPOINTMENT_PINS,
  groupPins: GROUP_PINS,
  groupAppointmentPins: GROUP_APPOINTMENT_PINS,
};

describe('selectFitPoints', () => {
  it('fits the appointment pins in appointments mode', () => {
    expect(
      selectFitPoints({ ...base, mode: 'appointments', groupDrilledIn: false }),
    ).toEqual(APPOINTMENT_PINS);
  });

  it('fits the group centroids in groups mode with no group open', () => {
    expect(
      selectFitPoints({ ...base, mode: 'groups', groupDrilledIn: false }),
    ).toEqual(GROUP_PINS);
  });

  it("fits the open group's appointment pins during drill-down", () => {
    expect(
      selectFitPoints({ ...base, mode: 'groups', groupDrilledIn: true }),
    ).toEqual(GROUP_APPOINTMENT_PINS);
  });

  it('ignores a stale drill-down flag while in appointments mode', () => {
    // Groups-mode state can linger for a tick after the mode toggle; the
    // appointments branch must not read the group arrays.
    expect(
      selectFitPoints({ ...base, mode: 'appointments', groupDrilledIn: true }),
    ).toEqual(APPOINTMENT_PINS);
  });
});
