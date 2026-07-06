import type { AvailabilityOverrideMap } from '@properfy/shared';
import type { IAvailabilitySlotRepository } from '../../domain/availability-slot.repository';
import { startOfTomorrowUtc, addDaysUtc } from './availability-horizon';

const HORIZON_WEEKS = 8;
const AM_START = '08:00';
const AM_END = '13:00';
const PM_START = '13:00';
const PM_END = '18:00';

type DayKey = keyof AvailabilityOverrideMap;

const DAY_INDEX_MAP: Record<number, DayKey> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
};

/**
 * Derives the 7×2 override map by querying operator-created slots with remaining
 * capacity in the next 8 weeks. A cell is `true` when at least one such slot
 * overlaps that day-of-week × half-day window (AM: 08:00-13:00, PM: 13:00-18:00).
 * Overlap detection handles non-standard operator time windows (e.g. 09:00-17:00).
 */
export async function deriveOverrideMap(
  inspectorId: string,
  slotRepo: Pick<IAvailabilitySlotRepository, 'findSlotsForRegeneration'>,
): Promise<AvailabilityOverrideMap> {
  const from = startOfTomorrowUtc();
  const to = addDaysUtc(from, HORIZON_WEEKS * 7 - 1);

  const slots = await slotRepo.findSlotsForRegeneration(inspectorId, from, to);

  const off = () => ({ am: false, pm: false });
  const map: AvailabilityOverrideMap = {
    mon: off(), tue: off(), wed: off(), thu: off(),
    fri: off(), sat: off(), sun: off(),
  };

  for (const slot of slots) {
    if (!slot.isOperatorOverride) continue;
    if (slot.capacity === 0) continue;

    const dayKey = DAY_INDEX_MAP[slot.date.getUTCDay()];
    if (!dayKey) continue;

    if (overlapsWindow(slot.startTime, slot.endTime, AM_START, AM_END)) {
      map[dayKey].am = true;
    }
    if (overlapsWindow(slot.startTime, slot.endTime, PM_START, PM_END)) {
      map[dayKey].pm = true;
    }
  }

  return map;
}

/** Returns true when [slotStart, slotEnd) and [winStart, winEnd) overlap. */
function overlapsWindow(slotStart: string, slotEnd: string, winStart: string, winEnd: string): boolean {
  return slotStart < winEnd && slotEnd > winStart;
}
