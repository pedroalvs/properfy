/**
 * Cycle 8 fix — "Show grouped" is an ADDITIVE toggle:
 *   - off → only individual (non-grouped) appointments (backend also sends ungroupedOnly).
 *   - on  → ALL appointments (individual + grouped combined).
 *
 * Cycle 8 corrected: the toggle was previously an exclusive switch where
 * `on` showed only grouped, leaving the view empty when grouped appointments
 * weren't in the response. Now `on` means "include grouped" = show everything.
 */

import { describe, it, expect } from 'vitest';
import { filterAppointmentsByGrouping } from './AppointmentMapPage';

const SEED = [
  { id: 'a', serviceGroupId: null },
  { id: 'b', serviceGroupId: 'sg-1' },
  { id: 'c', serviceGroupId: null },
  { id: 'd', serviceGroupId: 'sg-2' },
  { id: 'e' /* serviceGroupId absent altogether */ },
];

describe('filterAppointmentsByGrouping — Issue #2', () => {
  it('OFF: returns only individual appointments (serviceGroupId is null/undefined)', () => {
    const result = filterAppointmentsByGrouping(SEED, false);
    expect(result.map((r) => r.id)).toEqual(['a', 'c', 'e']);
  });

  it('ON: returns ALL appointments (individual + grouped combined)', () => {
    const result = filterAppointmentsByGrouping(SEED, true);
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('OFF + empty input: returns []', () => {
    expect(filterAppointmentsByGrouping([], false)).toEqual([]);
  });

  it('ON + empty input: returns []', () => {
    expect(filterAppointmentsByGrouping([], true)).toEqual([]);
  });

  it('OFF: treats an empty-string serviceGroupId as "not grouped" (defence against backend quirk)', () => {
    // Defensive: if the backend ever emits an empty string instead of
    // `null`, Boolean(emptyString) is false, so the item is classified
    // as individual. This keeps the toggle-off behaviour predictable.
    const result = filterAppointmentsByGrouping(
      [{ id: 'x', serviceGroupId: '' }],
      false,
    );
    expect(result.map((r) => r.id)).toEqual(['x']);
  });
});
