import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegenerateInspectorAvailabilitySlotsUseCase } from '../regenerate-inspector-availability-slots.use-case';
import type { AvailabilityTemplate } from '@properfy/shared';

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
const mockDeleteSlot = vi.fn<[string], Promise<void>>();
const mockCreateSlot = vi.fn<[unknown], Promise<void>>();

const slotRepo = {
  findSlotsForRegeneration: mockFindForRegeneration,
  deleteById: mockDeleteSlot,
  saveForRegeneration: mockCreateSlot,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const AM = '08:00-13:00';
const PM = '13:00-18:00';
const INSP_ID = 'insp-1';

/** Monday of a specific week in the 8-week horizon */
function nextMonday(): Date {
  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  d.setHours(0, 0, 0, 0);
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
    mockDeleteSlot.mockResolvedValue(undefined);
    mockCreateSlot.mockResolvedValue(undefined);
  });

  // Rule 1: capacity consumed (capacity === 0) → untouched
  it('Rule 1: leaves a slot with consumed capacity untouched even when template is OFF', async () => {
    const monday = nextMonday();
    const consumed = makeSlot({ id: 'slot-consumed', date: monday, startTime: '08:00', capacity: 0 });
    mockFindForRegeneration.mockResolvedValue([consumed]);

    const sut = makeSut();
    await sut.execute({ inspectorId: INSP_ID, template: allOffTemplate });

    expect(mockDeleteSlot).not.toHaveBeenCalled();
    expect(mockCreateSlot).not.toHaveBeenCalled();
  });

  // Rule 2: operator override → immutable
  it('Rule 2: leaves an operator-override slot untouched even when template is OFF', async () => {
    const monday = nextMonday();
    const override = makeSlot({ id: 'slot-override', date: monday, startTime: '08:00', isOperatorOverride: true });
    mockFindForRegeneration.mockResolvedValue([override]);

    const sut = makeSut();
    await sut.execute({ inspectorId: INSP_ID, template: allOffTemplate });

    expect(mockDeleteSlot).not.toHaveBeenCalled();
    expect(mockCreateSlot).not.toHaveBeenCalled();
  });

  // Rule 3: intact, no-override, capacity available, template ON → keep the slot, do NOT re-create it
  it('Rule 3: keeps an existing slot when template cell is ON and slot has no override or consumed capacity', async () => {
    const monday = nextMonday();
    const existing = makeSlot({ id: 'slot-intact', date: monday, startTime: '08:00' });
    mockFindForRegeneration.mockResolvedValue([existing]);

    const sut = makeSut();
    await sut.execute({ inspectorId: INSP_ID, template: monAmOnTemplate });

    // The slot must not be deleted
    expect(mockDeleteSlot).not.toHaveBeenCalledWith('slot-intact');
    // The slot must not be re-created (would be a duplicate on the same date+window)
    expect(mockCreateSlot).not.toHaveBeenCalledWith(
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

    expect(mockDeleteSlot).toHaveBeenCalledWith('slot-to-delete');
    expect(mockCreateSlot).not.toHaveBeenCalled();
  });

  // Rule 5: no slot exists, template ON → create
  it('Rule 5: creates a slot when no slot exists and template cell is ON', async () => {
    mockFindForRegeneration.mockResolvedValue([]);

    const sut = makeSut();
    await sut.execute({ inspectorId: INSP_ID, template: monAmOnTemplate });

    // Should create one slot per Monday in 8-week horizon
    expect(mockCreateSlot).toHaveBeenCalled();
    const calls = mockCreateSlot.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const firstCall = calls[0]?.[0] as Record<string, unknown>;
    expect(firstCall).toMatchObject({
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

    expect(mockDeleteSlot).not.toHaveBeenCalled();
    expect(mockCreateSlot).not.toHaveBeenCalled();
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

    expect(mockDeleteSlot).not.toHaveBeenCalled();
    expect(mockCreateSlot).not.toHaveBeenCalled();
  });

  // 8 weeks: exactly 8 Mondays created when template has mon.am=true and no existing slots
  it('creates one slot per Monday for 8 weeks when template has mon.am=true', async () => {
    mockFindForRegeneration.mockResolvedValue([]);

    const sut = makeSut();
    await sut.execute({ inspectorId: INSP_ID, template: monAmOnTemplate });

    expect(mockCreateSlot).toHaveBeenCalledTimes(8);
  });
});
