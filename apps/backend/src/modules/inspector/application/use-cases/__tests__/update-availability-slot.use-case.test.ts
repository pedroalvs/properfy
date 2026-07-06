import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateAvailabilitySlotUseCase } from '../update-availability-slot.use-case';
import { ForbiddenError } from '../../../../../shared/domain/errors';
import { AvailabilitySlotEntity } from '../../../domain/availability-slot.entity';
import type { IAvailabilitySlotRepository } from '../../../domain/availability-slot.repository';
import type { AuthContext } from '@properfy/shared';

const INSPECTOR_ID = '11111111-1111-4111-8111-111111111111';
const SLOT_ID = '22222222-2222-4222-8222-222222222222';

function makeSlot(overrides: Partial<{ isOperatorOverride: boolean }> = {}): AvailabilitySlotEntity {
  return new AvailabilitySlotEntity({
    id: SLOT_ID,
    inspectorId: INSPECTOR_ID,
    date: new Date('2026-08-10T00:00:00.000Z'),
    startTime: '08:00',
    endTime: '13:00',
    regionJson: null,
    capacity: 1,
    status: 'AVAILABLE',
    isOperatorOverride: overrides.isOperatorOverride ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeActor(role: AuthContext['role'], inspectorId?: string): AuthContext {
  return {
    userId: '33333333-3333-4333-8333-333333333333',
    tenantId: null,
    branchId: null,
    role,
    email: 'actor@test.local',
    inspectorId: inspectorId ?? null,
  } as unknown as AuthContext;
}

describe('UpdateAvailabilitySlotUseCase', () => {
  let slotRepo: IAvailabilitySlotRepository;
  const auditService = { log: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    slotRepo = {
      findById: vi.fn(),
      findByDateRange: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    } as unknown as IAvailabilitySlotRepository;
  });

  function useCase(): UpdateAvailabilitySlotUseCase {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new UpdateAvailabilitySlotUseCase(slotRepo, auditService as any);
  }

  it('rejects an INSP updating an operator-override slot (403)', async () => {
    vi.mocked(slotRepo.findById).mockResolvedValue(makeSlot({ isOperatorOverride: true }));

    await expect(
      useCase().execute({
        inspectorId: INSPECTOR_ID,
        slotId: SLOT_ID,
        data: { capacity: 0 },
        actor: makeActor('INSP', INSPECTOR_ID),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(slotRepo.update).not.toHaveBeenCalled();
  });

  it('allows an INSP updating their own non-override slot', async () => {
    vi.mocked(slotRepo.findById).mockResolvedValue(makeSlot());

    const result = await useCase().execute({
      inspectorId: INSPECTOR_ID,
      slotId: SLOT_ID,
      data: { capacity: 0 },
      actor: makeActor('INSP', INSPECTOR_ID),
    });

    expect(result.capacity).toBe(0);
    expect(slotRepo.update).toHaveBeenCalledWith(SLOT_ID, INSPECTOR_ID, { capacity: 0 });
  });

  it.each(['OP', 'AM'] as const)('allows %s updating an operator-override slot', async (role) => {
    vi.mocked(slotRepo.findById).mockResolvedValue(makeSlot({ isOperatorOverride: true }));

    const result = await useCase().execute({
      inspectorId: INSPECTOR_ID,
      slotId: SLOT_ID,
      data: { capacity: 2 },
      actor: makeActor(role),
    });

    expect(result.capacity).toBe(2);
    expect(slotRepo.update).toHaveBeenCalled();
  });

  it('rejects an INSP updating another inspector slot', async () => {
    await expect(
      useCase().execute({
        inspectorId: INSPECTOR_ID,
        slotId: SLOT_ID,
        data: { capacity: 0 },
        actor: makeActor('INSP', '44444444-4444-4444-8444-444444444444'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects CL_ADMIN entirely', async () => {
    await expect(
      useCase().execute({
        inspectorId: INSPECTOR_ID,
        slotId: SLOT_ID,
        data: { capacity: 0 },
        actor: makeActor('CL_ADMIN'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
