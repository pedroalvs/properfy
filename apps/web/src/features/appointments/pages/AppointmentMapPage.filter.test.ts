/**
 * Issue #2 (UX smoke) anti-regression — pin the SWITCH semantics of the
 * "Show grouped appointments" toggle on the /appointments map page.
 *
 * The toggle is a switch, not an additive checkbox:
 *   - off → only individual (non-grouped) appointments.
 *   - on  → only appointments that belong to a service group.
 *
 * Pre-fix the `on` branch returned every item, which is what the
 * smoke caught. The behaviour now lives in the exported pure helper
 * `filterAppointmentsByGrouping` for surgical testing.
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

  it('ON: returns only appointments that belong to a service group', () => {
    const result = filterAppointmentsByGrouping(SEED, true);
    expect(result.map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('OFF + empty input: returns []', () => {
    expect(filterAppointmentsByGrouping([], false)).toEqual([]);
  });

  it('ON + empty input: returns []', () => {
    expect(filterAppointmentsByGrouping([], true)).toEqual([]);
  });

  it('treats an empty-string serviceGroupId as "not grouped" (defence against backend quirk)', () => {
    // Defensive: if the backend ever emits an empty string instead of
    // `null`, Boolean(emptyString) is false, so the item is classified
    // as individual. This keeps the toggle behaviour predictable.
    const result = filterAppointmentsByGrouping(
      [{ id: 'x', serviceGroupId: '' }],
      false,
    );
    expect(result.map((r) => r.id)).toEqual(['x']);
  });
});
