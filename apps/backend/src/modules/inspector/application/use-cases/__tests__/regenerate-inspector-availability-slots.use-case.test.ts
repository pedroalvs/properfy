import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegenerateInspectorAvailabilitySlotsUseCase } from '../regenerate-inspector-availability-slots.use-case';
import type { AvailabilityTemplate } from '@properfy/shared';
import { startOfTomorrowUtc } from '../availability-horizon';

// ---------------------------------------------------------------------------
// Stub repo
// ---------------------------------------------------------------------------
interface StubSlot {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  capacity: number;
  isOperatorOverride: boolean;
}

const mockFindForRegeneration = vi.fn<[], Promise<StubSlot[]>>();
const mockDeleteMany = vi.fn<[string[]], Promise<void>>();
const mockCreateMany = vi.fn<[unknown[]], Promise<void>>();

const slotRepo = {
  findSlotsForRegeneration: mockFindForRegeneration,
  deleteManyByIds: mockDeleteMany,
  saveManyForRegeneration: mockCreateMany,
};

/** All rows passed to the single saveManyForRegeneration batch call (empty if none). */
function createdRows(): Array<Record<string, unknown>> {
  return (mockCreateMany.mock.calls[0]?.[0] as Array<Record<string, unknown>>) ?? [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const _AM = '08:00-13:00';
const _PM = '13:00-18:00';
const INSP_ID = 'insp-1';

/** Monday (UTC-midnight) of a specific week in the 8-week horizon */
function nextMonday(): Date {
  const d = startOfTomorrowUtc();
  d.setUTCDate(d.getUTCDate() + ((1 + 7 - d.getUTCDay()) % 7));
  return d;
}

function makeSlot(overrides: Partial<StubSlot> & Pick<StubSlot, 'date' | 'startTime'>): StubSlot {
  return {
    id: `slot-${Math.random().toString(36).slice(2)}`,
    endTime: overrides.startTime === '08:00' ? '13:00' : '18:00',
    capacity: 1,
    isOperatorOverride: false,
    ...overrides,
  };
}

const allOffTemplate: AvailabilityTemplate = {
  mon: { am: false, pm: false },
  tue: { am: false, pm: false },
  wed: { am: false, pm: false },
  thu: { am: false, pm: false },
  fri: { am: false, pm: false },
  sat: { am: false, pm: false },
  sun: { am: false, pm: false },
};

const monAmOnTemplate: AvailabilityTemplate = {
  ...allOffTemplate,
  mon: { am: true, pm: false },
};

function makeSut() {
  return new RegenerateInspectorAvailabilitySlotsUseCase(slotRepo as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('RegenerateInspectorAvailabilitySlotsUseCase — 6 merge rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteMany.mockResolvedValue(undefined);
    mockCreateMany.mockResolvedValue(undefined);
  });

  // Rule 1: capacity consumed (capacity === 0) → untouched
  it('Rule 1: leaves a slot with consumed capacity untouched even when template is OFF', async () => {
    const monday = nextMonday();
    const consumed = makeSlot({ id: 'slot-consumed', date: monday, startTime: '08:00', capacity: 0 });
    mockFindForRegeneration.mockResolvedValue([consumed]);

    const sut = makeSut();
    await sut.execute({ inspectorId: INSP_ID, template: allOffTemplate });

    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  // Rule 2: operator override → immutable
  it('Rule 2: leaves an operator-override slot untouched even when template is OFF', async () => {
    const monday = nextMonday();
    const override = makeSlot({ id: 'slot-override', date: monday, startTime: '08:00', isOperatorOverride: true });
    mockFindForRegeneration.mockResolvedValue([override]);

    const sut = makeSut();
    await sut.execute({ inspectorId: INSP_ID, template: allOffTemplate });

    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  // Rule 3: intact, no-override, capacity available, template ON → keep the slot, do NOT re-create it
  it('Rule 3: keeps an existing slot when template cell is ON and slot has no override or consumed capacity', async () => {
    const monday = nextMonday();
    const existing = makeSlot({ id: 'slot-intact', date: monday, startTime: '08:00' });
    mockFindForRegeneration.mockResolvedValue([existing]);

    const sut = makeSut();
    await sut.execute({ inspectorId: INSP_ID, template: monAmOnTemplate });

    // The intact slot must not be deleted (nothing else on the horizon needs deleting either)
    expect(mockDeleteMany).not.toHaveBeenCalled();
    // The intact slot must not be re-created (would be a duplicate on the same date+window)
    expect(createdRows()).not.toContainEqual(
      expect.objectContaining({ date: monday, startTime: '08:00' }),
    );
  });

  // Rule 4: intact, no-override, capacity available, template OFF → delete
  it('Rule 4: deletes an existing slot when template cell is OFF and slot has no override or consumed capacity', async () => {
    const monday = nextMonday();
    const existing = makeSlot({ id: 'slot-to-delete', date: monday, startTime: '08:00' });
    mockFindForRegeneration.mockResolvedValue([existing]);

    const sut = makeSut();
    // allOffTemplate: mon AM = false → should delete existing slot
    await sut.execute({ inspectorId: INSP_ID, template: allOffTemplate });

    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockDeleteMany.mock.calls[0]?.[0]).toEqual(['slot-to-delete']);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  // Rule 5: no slot exists, template ON → create
  it('Rule 5: creates a slot when no slot exists and template cell is ON', async () => {
    mockFindForRegeneration.mockResolvedValue([]);

    const sut = makeSut();
    await sut.execute({ inspectorId: INSP_ID, template: monAmOnTemplate });

    // Should create one slot per Monday in 8-week horizon, in a single batch
    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    const rows = createdRows();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]).toMatchObject({
      inspectorId: INSP_ID,
      startTime: '08:00',
      endTime: '13:00',
      capacity: 1,
      isOperatorOverride: false,
    });
  });

  // Rule 6: no slot exists, template OFF → noop
  it('Rule 6: does nothing when no slot exists and template cell is OFF', async () => {
    mockFindForRegeneration.mockResolvedValue([]);

    const sut = makeSut();
    await sut.execute({ inspectorId: INSP_ID, template: allOffTemplate });

    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  // Combination: same window has override AND consumed-capacity slot
  it('Combination: override slot + consumed slot in same window are both left untouched', async () => {
    const monday = nextMonday();
    const nextMonday2 = new Date(monday);
    nextMonday2.setDate(nextMonday2.getDate() + 7);

    const override = makeSlot({ id: 'slot-override', date: monday, startTime: '08:00', isOperatorOverride: true });
    const consumed = makeSlot({ id: 'slot-consumed', date: nextMonday2, startTime: '08:00', capacity: 0 });
    mockFindForRegeneration.mockResolvedValue([override, consumed]);

    const sut = makeSut();
    // template OFF means delete any non-override, non-consumed → but both are protected
    await sut.execute({ inspectorId: INSP_ID, template: allOffTemplate });

    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  // 8 weeks: exactly 8 Mondays created when template has mon.am=true and no existing slots
  it('creates one slot per Monday for 8 weeks when template has mon.am=true', async () => {
    mockFindForRegeneration.mockResolvedValue([]);

    const sut = makeSut();
    await sut.execute({ inspectorId: INSP_ID, template: monAmOnTemplate });

    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    expect(createdRows()).toHaveLength(8);
  });

  // Batching: deletes and creates each collapse into ONE repo call, not N one-by-one calls
  it('issues exactly one batched delete and one batched create across a multi-slot regeneration', async () => {
    const monday = nextMonday();
    const tuesday = new Date(monday);
    tuesday.setUTCDate(tuesday.getUTCDate() + 1);
    const tuesday2 = new Date(tuesday);
    tuesday2.setUTCDate(tuesday2.getUTCDate() + 7);

    // Two existing Tuesday-AM slots; template has tue OFF → both must be deleted.
    // Template has mon.am ON with no existing slots → 8 Mondays must be created.
    const toDelete1 = makeSlot({ id: 'del-tue-1', date: tuesday, startTime: '08:00' });
    const toDelete2 = makeSlot({ id: 'del-tue-2', date: tuesday2, startTime: '08:00' });
    mockFindForRegeneration.mockResolvedValue([toDelete1, toDelete2]);

    const sut = makeSut();
    await sut.execute({ inspectorId: INSP_ID, template: monAmOnTemplate });

    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockDeleteMany.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining(['del-tue-1', 'del-tue-2']),
    );
    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    expect(createdRows()).toHaveLength(8);
  });
});
