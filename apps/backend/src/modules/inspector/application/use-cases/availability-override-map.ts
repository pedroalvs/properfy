import type { AvailabilityOverrideMap } from '@properfy/shared';
import type { IAvailabilitySlotRepository } from '../../domain/availability-slot.repository';

const HORIZON_WEEKS = 8;
const AM_START = '08:00';
const PM_START = '13:00';

type DayKey = keyof AvailabilityOverrideMap;

const DAY_INDEX_MAP: Record<number, DayKey> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
};

/**
 * Derives the 7×2 override map by querying operator-created slots with remaining
 * capacity in the next 8 weeks. A cell is `true` when at least one such slot
 * exists for that day-of-week × half-day window.
 */
export async function deriveOverrideMap(
  inspectorId: string,
  slotRepo: Pick<IAvailabilitySlotRepository, 'findSlotsForRegeneration'>,
): Promise<AvailabilityOverrideMap> {
  const from = startOfTomorrow();
  const to = addDays(from, HORIZON_WEEKS * 7 - 1);

  const slots = await slotRepo.findSlotsForRegeneration(inspectorId, from, to);

  const off = () => ({ am: false, pm: false });
  const map: AvailabilityOverrideMap = {
    mon: off(), tue: off(), wed: off(), thu: off(),
    fri: off(), sat: off(), sun: off(),
  };

  for (const slot of slots) {
    if (!slot.isOperatorOverride) continue;
    if (slot.capacity === 0) continue;

    const dayKey = DAY_INDEX_MAP[slot.date.getDay()];
    if (!dayKey) continue;

    if (slot.startTime === AM_START) {
      map[dayKey].am = true;
    } else if (slot.startTime === PM_START) {
      map[dayKey].pm = true;
    }
  }

  return map;
}

function startOfTomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
