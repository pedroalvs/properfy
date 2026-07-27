/**
 * The filter panel header used to count the raw API rows while the map plotted
 * only the rows that HAVE coordinates — so "Filters · 1 groups" could sit above
 * an empty map (a searched group whose appointments are all un-geocoded has no
 * centroid and is silently dropped). This pins the honest label: the "on map"
 * suffix appears exactly when some rows can't be plotted.
 */

import { describe, it, expect } from 'vitest';
import { formatPinCountLabel } from './AppointmentMapPage';

describe('formatPinCountLabel', () => {
  it('flags the gap when a matched group cannot be plotted', () => {
    // The reported bug: search "25" matches one group with no geocoded appointments.
    expect(formatPinCountLabel('group', 1, 0)).toBe('1 group · 0 on map');
  });

  it('flags a partial gap', () => {
    expect(formatPinCountLabel('appointment', 3, 1)).toBe('3 appointments · 1 on map');
  });

  it('omits the suffix when every row is plotted', () => {
    expect(formatPinCountLabel('group', 12, 12)).toBe('12 groups');
    expect(formatPinCountLabel('appointment', 4, 4)).toBe('4 appointments');
  });

  it('singularises on a total of exactly one', () => {
    expect(formatPinCountLabel('group', 1, 1)).toBe('1 group');
    expect(formatPinCountLabel('appointment', 1, 1)).toBe('1 appointment');
  });

  it('pluralises the empty result', () => {
    expect(formatPinCountLabel('group', 0, 0)).toBe('0 groups');
    expect(formatPinCountLabel('appointment', 0, 0)).toBe('0 appointments');
  });
});
