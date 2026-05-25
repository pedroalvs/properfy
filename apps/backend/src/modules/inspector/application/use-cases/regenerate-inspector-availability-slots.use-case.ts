import type { AvailabilityTemplate } from '@properfy/shared';
import type { IAvailabilitySlotRepository } from '../../domain/availability-slot.repository';

const AM_START = '08:00';
const AM_END = '13:00';
const PM_START = '13:00';
const PM_END = '18:00';
const HORIZON_WEEKS = 8;
const DEFAULT_CAPACITY = 1;

type DayKey = keyof AvailabilityTemplate;
type PeriodKey = 'am' | 'pm';

/** JS getDay() index → template day key. Sunday = 0. */
const DAY_INDEX_MAP: Record<number, DayKey> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

interface SlotForRegen {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  capacity: number;
  isOperatorOverride: boolean;
}

export interface RegenerateInput {
  inspectorId: string;
  template: AvailabilityTemplate;
}

export interface RegenerateOutput {
  slotsCreated: number;
  slotsDeleted: number;
  slotsPreserved: number;
}

type SlotRepoForRegen = Pick<
  IAvailabilitySlotRepository,
  'findSlotsForRegeneration' | 'deleteById' | 'saveForRegeneration'
>;

/**
 * Regenerates the next 8 weeks of InspectorAvailabilitySlot rows based on the
 * inspector's weekly template, applying 6 merge rules in priority order:
 * 1. Capacity-consumed slot → untouched
 * 2. Operator-override slot → untouched
 * 3. Intact, template ON, no override, available → keep
 * 4. Intact, template OFF, no override, available → delete
 * 5. No slot, template ON → create with DEFAULT_CAPACITY
 * 6. No slot, template OFF → noop
 */
export class RegenerateInspectorAvailabilitySlotsUseCase {
  constructor(private readonly slotRepo: SlotRepoForRegen) {}

  async execute(input: RegenerateInput): Promise<RegenerateOutput> {
    const { inspectorId, template } = input;

    const horizonStart = startOfTomorrow();
    const horizonEnd = addDays(horizonStart, HORIZON_WEEKS * 7 - 1);

    const existingSlots = await this.slotRepo.findSlotsForRegeneration(
      inspectorId,
      horizonStart,
      horizonEnd,
    );

    const slotsByDateWindow = indexSlots(existingSlots);

    let slotsCreated = 0;
    let slotsDeleted = 0;
    let slotsPreserved = 0;

    const days = eachDayInRange(horizonStart, horizonEnd);

    for (const date of days) {
      const dayKey = DAY_INDEX_MAP[date.getDay()];
      if (!dayKey) continue;

      for (const { period, startTime, endTime } of [
        { period: 'am' as PeriodKey, startTime: AM_START, endTime: AM_END },
        { period: 'pm' as PeriodKey, startTime: PM_START, endTime: PM_END },
      ]) {
        const templateOn = template[dayKey][period];
        const slotKey = toKey(date, startTime);
        const existing = slotsByDateWindow.get(slotKey);

        if (existing) {
          // Rule 1: consumed → untouched
          if (existing.capacity === 0) continue;
          // Rule 2: operator override → untouched
          if (existing.isOperatorOverride) continue;
          // Rule 3: template ON, available, no override → keep
          if (templateOn) {
            slotsPreserved++;
            continue;
          }
          // Rule 4: template OFF, available, no override → delete
          await this.slotRepo.deleteById(existing.id);
          slotsDeleted++;
        } else {
          // Rule 5: template ON, no slot → create
          if (templateOn) {
            await this.slotRepo.saveForRegeneration({
              inspectorId,
              date,
              startTime,
              endTime,
              capacity: DEFAULT_CAPACITY,
              status: 'AVAILABLE',
              isOperatorOverride: false,
            });
            slotsCreated++;
          }
          // Rule 6: template OFF, no slot → noop
        }
      }
    }

    return { slotsCreated, slotsDeleted, slotsPreserved };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function eachDayInRange(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(from);
  while (cur <= to) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function toKey(date: Date, startTime: string): string {
  return `${date.toISOString().slice(0, 10)}:${startTime}`;
}

function indexSlots(slots: SlotForRegen[]): Map<string, SlotForRegen> {
  const map = new Map<string, SlotForRegen>();
  for (const slot of slots) {
    map.set(toKey(slot.date, slot.startTime), slot);
  }
  return map;
}
