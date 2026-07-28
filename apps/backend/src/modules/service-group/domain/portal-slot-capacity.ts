/**
 * How many inspections a service group can still absorb inside a given time
 * window, for the rental tenant portal's "Change time" picker.
 *
 * An appointment's `time_slot_start`/`time_slot_end` is a *promise of a visit
 * somewhere inside the interval*, not an occupancy of the whole interval —
 * three appointments booked 08:00-16:00 do not block that range, they consume
 * three of its slots. So capacity cannot be modelled as fixed hourly buckets:
 * it is an interval-packing question.
 *
 * Each member is one unit of work servable anywhere inside its window, and the
 * inspector does at most `INSPECTIONS_PER_HOUR`. Such a set is schedulable iff,
 * for every interval `[a,b]`, the members whose window is *contained* in `[a,b]`
 * fit within `intervalCapacity(a,b)` (Hall's condition for unit jobs with
 * interval windows; checking intervals whose endpoints are member endpoints is
 * sufficient).
 *
 * A new appointment promised window `W` can only ever load intervals that
 * contain `W`, so those are the only ones worth checking. That is also what
 * keeps an already-saturated *sub*-interval from wrongly hiding a wider window:
 * a visit promised 08:00-17:00 can be served at 14:00 even when 09:00-10:00 is
 * packed.
 */

/** An inspector performs at most this many inspections per hour. */
export const INSPECTIONS_PER_HOUR = 2;

/**
 * The same rule stated per inspection. Working in minutes-per-inspection rather
 * than inspections-per-hour is what lets a window like 08:00-08:45 resolve
 * without special-casing fractional hours.
 */
export const MINUTES_PER_INSPECTION = 60 / INSPECTIONS_PER_HOUR;

export interface TimeWindow {
  timeSlotStart: string;
  timeSlotEnd: string;
}

export interface PortalSlotMember extends TimeWindow {
  /**
   * Whether this appointment belongs to the agency asking for slots. Service
   * groups are cross-agency, so every member consumes the inspector's time,
   * but only the caller's own windows are offered back to the tenant.
   */
  isOwnAgency: boolean;
}

export interface WindowAvailability {
  /** Inspections the window could hold on its own: its duration x 2/hour. */
  capacityMax: number;
  /** Derived as `capacityMax - remaining`, so a full window always reads n/n. */
  bookedCount: number;
  /** Inspections that can still be promised inside the window. */
  remaining: number;
}

export interface PortalSlotRow extends TimeWindow, WindowAvailability {}

const EMPTY_AVAILABILITY: WindowAvailability = { capacityMax: 0, bookedCount: 0, remaining: 0 };

/** Inspections that fit between two minute-of-day marks. Partial slots do not count. */
export function intervalCapacity(startMinutes: number, endMinutes: number): number {
  return Math.max(0, Math.floor((endMinutes - startMinutes) / MINUTES_PER_INSPECTION));
}

/**
 * Availability of `window` given everything already booked in the same group
 * on the same day. `window` is the slot being offered, so it is *not* one of
 * `members` — the caller is asking whether one more visit fits.
 */
export function computeWindowAvailability(
  members: readonly TimeWindow[],
  window: TimeWindow,
): WindowAvailability {
  const target = parseWindow(window);
  if (!target) return EMPTY_AVAILABILITY;

  const booked = members
    .map(parseWindow)
    .filter((parsed): parsed is ParsedWindow => parsed !== null);

  const marks = [target.start, target.end, ...booked.flatMap((m) => [m.start, m.end])];
  // Only intervals enclosing the target can be loaded by a visit promised in it.
  const lowerBounds = distinct(marks.filter((mark) => mark <= target.start));
  const upperBounds = distinct(marks.filter((mark) => mark >= target.end));

  let remaining = Number.POSITIVE_INFINITY;
  for (const from of lowerBounds) {
    for (const to of upperBounds) {
      const contained = booked.filter((m) => m.start >= from && m.end <= to).length;
      remaining = Math.min(remaining, intervalCapacity(from, to) - contained);
    }
  }

  // `[target.start, target.end]` is always among the pairs above, so `remaining`
  // is finite here and never exceeds the window's own capacity.
  const capacityMax = intervalCapacity(target.start, target.end);
  const clamped = Math.max(0, remaining);

  return { capacityMax, bookedCount: capacityMax - clamped, remaining: clamped };
}

/**
 * The selectable rows for one group on one day: every distinct own-agency
 * window that still has room, each carrying its own numbers. Windows with no
 * room left are dropped rather than shown greyed out — the portal offers only
 * what can actually be booked.
 */
export function buildPortalSlotRows(members: readonly PortalSlotMember[]): PortalSlotRow[] {
  const offerable = new Map<string, TimeWindow>();
  for (const member of members) {
    if (!member.isOwnAgency || !parseWindow(member)) continue;
    const { timeSlotStart, timeSlotEnd } = member;
    offerable.set(`${timeSlotStart}-${timeSlotEnd}`, { timeSlotStart, timeSlotEnd });
  }

  return [...offerable.values()]
    .map((window) => ({ ...window, ...computeWindowAvailability(members, window) }))
    .filter((row) => row.remaining > 0)
    .sort((a, b) => (
      a.timeSlotStart.localeCompare(b.timeSlotStart) || a.timeSlotEnd.localeCompare(b.timeSlotEnd)
    ));
}

export interface PortalEligibleSlotSource extends PortalSlotMember {
  groupId: string;
  scheduledDate: Date;
  suburb: string;
  inspectorName: string;
}

export interface PortalEligibleSlot extends PortalSlotRow {
  groupId: string;
  scheduledDate: Date;
  suburb: string;
  inspectorName: string;
}

/**
 * Turn the flat member list a repository returns into the slots the portal can
 * offer. Capacity is scoped to one group on one day — an inspector's Friday
 * route constrains nothing about their Monday one — so members are bucketed by
 * `(groupId, scheduledDate)` before the packing rule is applied.
 */
export function buildPortalEligibleSlots(
  members: readonly PortalEligibleSlotSource[],
): PortalEligibleSlot[] {
  const byGroupDay = new Map<string, PortalEligibleSlotSource[]>();
  for (const member of members) {
    const key = `${member.groupId}|${toDateKey(member.scheduledDate)}`;
    const bucket = byGroupDay.get(key);
    if (bucket) bucket.push(member);
    else byGroupDay.set(key, [member]);
  }

  const slots: PortalEligibleSlot[] = [];
  for (const bucket of byGroupDay.values()) {
    const group = bucket[0];
    if (!group) continue;

    for (const row of buildPortalSlotRows(bucket)) {
      // `buildPortalSlotRows` only offers own-agency windows, so the occupants
      // of this exact window are always a non-empty subset of the bucket.
      const suburbs = bucket
        .filter((m) => m.isOwnAgency && m.timeSlotStart === row.timeSlotStart && m.timeSlotEnd === row.timeSlotEnd)
        .map((m) => m.suburb)
        .sort();

      slots.push({
        ...row,
        groupId: group.groupId,
        scheduledDate: group.scheduledDate,
        inspectorName: group.inspectorName,
        suburb: suburbs[0] ?? group.suburb,
      });
    }
  }

  return slots.sort((a, b) => (
    toDateKey(a.scheduledDate).localeCompare(toDateKey(b.scheduledDate))
    || a.timeSlotStart.localeCompare(b.timeSlotStart)
    || a.timeSlotEnd.localeCompare(b.timeSlotEnd)
    || a.groupId.localeCompare(b.groupId)
  ));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface ParsedWindow {
  start: number;
  end: number;
}

function parseWindow(window: TimeWindow): ParsedWindow | null {
  const start = parseTimeOfDay(window.timeSlotStart);
  const end = parseTimeOfDay(window.timeSlotEnd);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

function parseTimeOfDay(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function distinct(values: number[]): number[] {
  return [...new Set(values)];
}
