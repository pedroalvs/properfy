import { describe, it, expect } from 'vitest';
import {
  INSPECTIONS_PER_HOUR,
  intervalCapacity,
  computeWindowAvailability,
  buildPortalSlotRows,
  buildPortalEligibleSlots,
  type PortalSlotMember,
  type PortalEligibleSlotSource,
} from '../../../src/modules/service-group/domain/portal-slot-capacity';

function window(timeSlotStart: string, timeSlotEnd: string) {
  return { timeSlotStart, timeSlotEnd };
}

function member(timeSlotStart: string, timeSlotEnd: string, isOwnAgency = true): PortalSlotMember {
  return { timeSlotStart, timeSlotEnd, isOwnAgency };
}

/** `n` members sharing the same window — the common shape of a grouped route. */
function members(count: number, start: string, end: string, isOwnAgency = true): PortalSlotMember[] {
  return Array.from({ length: count }, () => member(start, end, isOwnAgency));
}

describe('intervalCapacity', () => {
  it('yields two inspections per hour', () => {
    expect(INSPECTIONS_PER_HOUR).toBe(2);
    expect(intervalCapacity(8 * 60, 9 * 60)).toBe(2);
    expect(intervalCapacity(8 * 60, 17 * 60)).toBe(18);
    expect(intervalCapacity(7 * 60, 12 * 60)).toBe(10);
  });

  it('floors partial hours instead of rounding up', () => {
    // 45 minutes buys one inspection, not one and a half.
    expect(intervalCapacity(8 * 60, 8 * 60 + 45)).toBe(1);
    expect(intervalCapacity(8 * 60, 8 * 60 + 29)).toBe(0);
    expect(intervalCapacity(8 * 60, 8 * 60 + 30)).toBe(1);
  });

  it('never returns a negative capacity for an inverted interval', () => {
    expect(intervalCapacity(12 * 60, 8 * 60)).toBe(0);
  });
});

describe('computeWindowAvailability', () => {
  it('reports the window capacity when the group is empty', () => {
    expect(computeWindowAvailability([], window('08:00', '17:00'))).toEqual({
      capacityMax: 18,
      bookedCount: 0,
      remaining: 18,
    });
  });

  // The scenario that motivated the rule: a group where most appointments share
  // one wide window and a later appointment sits in a partly overlapping one.
  describe('3x 08:00-16:00 plus 1x 15:00-18:00', () => {
    const group = [...members(3, '08:00', '16:00'), member('15:00', '18:00')];

    it('charges the wide window only for the appointments contained in it', () => {
      expect(computeWindowAvailability(group, window('08:00', '16:00'))).toEqual({
        capacityMax: 16,
        bookedCount: 3,
        remaining: 13,
      });
    });

    it('does not let the three 08:00-16:00 appointments inflate the 15:00-18:00 window', () => {
      // They overlap 15:00-16:00, but the inspector can serve them earlier, so
      // they only bind through the enclosing 08:00-18:00 interval.
      expect(computeWindowAvailability(group, window('15:00', '18:00'))).toEqual({
        capacityMax: 6,
        bookedCount: 1,
        remaining: 5,
      });
    });
  });

  it('ignores a member window that is disjoint from the candidate', () => {
    const group = [member('12:00', '13:00')];
    expect(computeWindowAvailability(group, window('08:00', '09:00'))).toEqual({
      capacityMax: 2,
      bookedCount: 0,
      remaining: 2,
    });
  });

  it('is bound by an enclosing interval that is already saturated', () => {
    // 09:00-10:30 holds 3 appointments and fits exactly 3. Nothing more can be
    // promised inside it, even though 09:00-10:00 looks half empty on its own.
    const group = members(3, '09:00', '10:30');
    expect(computeWindowAvailability(group, window('09:00', '10:00'))).toEqual({
      capacityMax: 2,
      bookedCount: 2,
      remaining: 0,
    });
  });

  it('leaves a wider window open when only a sub-interval is saturated', () => {
    // A new appointment promised 08:00-17:00 can be served at 14:00, so the
    // packed 09:00-10:00 hour must not hide the whole day.
    const group = members(2, '09:00', '10:00');
    expect(computeWindowAvailability(group, window('08:00', '17:00'))).toEqual({
      capacityMax: 18,
      bookedCount: 2,
      remaining: 16,
    });
  });

  it('reports a fully booked window as booked === capacity, never over', () => {
    const group = members(2, '08:00', '09:00');
    expect(computeWindowAvailability(group, window('08:00', '09:00'))).toEqual({
      capacityMax: 2,
      bookedCount: 2,
      remaining: 0,
    });
  });

  it('clamps an over-subscribed window instead of reporting more than capacity', () => {
    // Legacy data can already exceed the rule; the label must still read n/n.
    const group = members(5, '08:00', '09:00');
    expect(computeWindowAvailability(group, window('08:00', '09:00'))).toEqual({
      capacityMax: 2,
      bookedCount: 2,
      remaining: 0,
    });
  });

  it('fails closed on an unparseable window', () => {
    expect(computeWindowAvailability([], window('8am', '5pm'))).toEqual({
      capacityMax: 0,
      bookedCount: 0,
      remaining: 0,
    });
  });

  it('ignores members with unparseable times rather than dropping the window', () => {
    const group = [member('', ''), member('08:00', '09:00')];
    expect(computeWindowAvailability(group, window('08:00', '10:00'))).toEqual({
      capacityMax: 4,
      bookedCount: 1,
      remaining: 3,
    });
  });
});

describe('buildPortalSlotRows', () => {
  it('returns one row per distinct window, each with its own numbers', () => {
    const rows = buildPortalSlotRows([
      ...members(3, '08:00', '16:00'),
      member('15:00', '18:00'),
    ]);

    expect(rows).toEqual([
      { timeSlotStart: '08:00', timeSlotEnd: '16:00', capacityMax: 16, bookedCount: 3, remaining: 13 },
      { timeSlotStart: '15:00', timeSlotEnd: '18:00', capacityMax: 6, bookedCount: 1, remaining: 5 },
    ]);
  });

  it('omits windows with no room left', () => {
    const rows = buildPortalSlotRows(members(2, '08:00', '09:00'));
    expect(rows).toEqual([]);
  });

  it('counts members from other agencies but never offers their windows', () => {
    // Groups are cross-agency: another agency's appointment still consumes the
    // inspector's time, yet only the caller's own windows are selectable.
    const rows = buildPortalSlotRows([
      member('08:00', '09:00', true),
      member('08:00', '09:00', false),
      member('10:00', '11:00', false),
    ]);

    expect(rows).toEqual([]);
  });

  it('offers an own-agency window whose capacity is partly used by another agency', () => {
    const rows = buildPortalSlotRows([
      member('08:00', '10:00', true),
      member('08:00', '10:00', false),
    ]);

    expect(rows).toEqual([
      { timeSlotStart: '08:00', timeSlotEnd: '10:00', capacityMax: 4, bookedCount: 2, remaining: 2 },
    ]);
  });

  it('sorts rows by start then end', () => {
    const rows = buildPortalSlotRows([
      member('13:00', '15:00'),
      member('08:00', '17:00'),
      member('08:00', '12:00'),
    ]);

    expect(rows.map((r) => `${r.timeSlotStart}-${r.timeSlotEnd}`)).toEqual([
      '08:00-12:00',
      '08:00-17:00',
      '13:00-15:00',
    ]);
  });

  it('returns nothing for an empty group', () => {
    expect(buildPortalSlotRows([])).toEqual([]);
  });
});

describe('buildPortalEligibleSlots', () => {
  function source(
    overrides: Partial<PortalEligibleSlotSource> & Pick<PortalEligibleSlotSource, 'timeSlotStart' | 'timeSlotEnd'>,
  ): PortalEligibleSlotSource {
    return {
      groupId: 'sg-1',
      scheduledDate: new Date('2026-07-31'),
      suburb: 'Sydney',
      inspectorName: 'Mike Inspector',
      isOwnAgency: true,
      ...overrides,
    };
  }

  it('carries the group metadata onto each computed row', () => {
    const slots = buildPortalEligibleSlots([source({ timeSlotStart: '08:00', timeSlotEnd: '17:00' })]);

    expect(slots).toEqual([
      {
        groupId: 'sg-1',
        scheduledDate: new Date('2026-07-31'),
        suburb: 'Sydney',
        inspectorName: 'Mike Inspector',
        timeSlotStart: '08:00',
        timeSlotEnd: '17:00',
        capacityMax: 18,
        bookedCount: 1,
        remaining: 17,
      },
    ]);
  });

  it('keeps each group-day independent', () => {
    // Two full 08:00-09:00 windows in one group must not make another group's
    // identical window look busy.
    const slots = buildPortalEligibleSlots([
      source({ groupId: 'sg-1', timeSlotStart: '08:00', timeSlotEnd: '09:00' }),
      source({ groupId: 'sg-1', timeSlotStart: '08:00', timeSlotEnd: '09:00' }),
      source({ groupId: 'sg-2', timeSlotStart: '08:00', timeSlotEnd: '09:00' }),
    ]);

    expect(slots).toEqual([
      expect.objectContaining({ groupId: 'sg-2', capacityMax: 2, bookedCount: 1, remaining: 1 }),
    ]);
  });

  it('keeps each date of the same group independent', () => {
    const slots = buildPortalEligibleSlots([
      source({ scheduledDate: new Date('2026-07-31'), timeSlotStart: '08:00', timeSlotEnd: '09:00' }),
      source({ scheduledDate: new Date('2026-07-31'), timeSlotStart: '08:00', timeSlotEnd: '09:00' }),
      source({ scheduledDate: new Date('2026-08-03'), timeSlotStart: '08:00', timeSlotEnd: '09:00' }),
    ]);

    expect(slots).toEqual([
      expect.objectContaining({ scheduledDate: new Date('2026-08-03'), bookedCount: 1, remaining: 1 }),
    ]);
  });

  it('takes the alphabetically first suburb among the window occupants', () => {
    const slots = buildPortalEligibleSlots([
      source({ timeSlotStart: '08:00', timeSlotEnd: '12:00', suburb: 'Redfern' }),
      source({ timeSlotStart: '08:00', timeSlotEnd: '12:00', suburb: 'Bondi' }),
    ]);

    expect(slots).toHaveLength(1);
    expect(slots[0]!.suburb).toBe('Bondi');
  });

  it('counts another agency towards capacity without offering its window', () => {
    const slots = buildPortalEligibleSlots([
      source({ timeSlotStart: '08:00', timeSlotEnd: '10:00' }),
      source({ timeSlotStart: '10:00', timeSlotEnd: '11:00', isOwnAgency: false }),
    ]);

    expect(slots.map((s) => `${s.timeSlotStart}-${s.timeSlotEnd}`)).toEqual(['08:00-10:00']);
    expect(slots[0]).toMatchObject({ capacityMax: 4, bookedCount: 1, remaining: 3 });
  });

  it('sorts by date, then start, then end', () => {
    const slots = buildPortalEligibleSlots([
      source({ scheduledDate: new Date('2026-08-03'), timeSlotStart: '08:00', timeSlotEnd: '12:00' }),
      source({ scheduledDate: new Date('2026-07-31'), timeSlotStart: '13:00', timeSlotEnd: '15:00' }),
      source({ scheduledDate: new Date('2026-07-31'), timeSlotStart: '09:00', timeSlotEnd: '15:00' }),
    ]);

    expect(slots.map((s) => `${s.scheduledDate.toISOString().slice(0, 10)} ${s.timeSlotStart}`)).toEqual([
      '2026-07-31 09:00',
      '2026-07-31 13:00',
      '2026-08-03 08:00',
    ]);
  });

  it('returns nothing when there are no members', () => {
    expect(buildPortalEligibleSlots([])).toEqual([]);
  });
});
