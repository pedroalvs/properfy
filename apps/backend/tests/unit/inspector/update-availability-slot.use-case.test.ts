import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateAvailabilitySlotUseCase } from '../../../src/modules/inspector/application/use-cases/update-availability-slot.use-case';
import type { IAvailabilitySlotRepository } from '../../../src/modules/inspector/domain/availability-slot.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { AvailabilitySlotEntity } from '../../../src/modules/inspector/domain/availability-slot.entity';
import {
  AvailabilitySlotNotFoundError,
  AvailabilitySlotOverlapError,
} from '../../../src/modules/inspector/domain/inspector.errors';

function makeSlot(
  overrides: Partial<ConstructorParameters<typeof AvailabilitySlotEntity>[0]> = {},
): AvailabilitySlotEntity {
  return new AvailabilitySlotEntity({
    id: 'slot-1',
    inspectorId: 'inspector-1',
    date: new Date('2026-04-01'),
    startTime: '09:00',
    endTime: '12:00',
    regionJson: null,
    capacity: 1,
    status: 'AVAILABLE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-am-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    ...overrides,
  };
}

describe('UpdateAvailabilitySlotUseCase', () => {
  let slotRepo: IAvailabilitySlotRepository;
  let auditService: AuditService;
  let useCase: UpdateAvailabilitySlotUseCase;

  beforeEach(() => {
    slotRepo = {
      findById: vi.fn(),
      findByDateRange: vi.fn().mockResolvedValue([]),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateAvailabilitySlotUseCase(slotRepo, auditService);
  });

  it('should update slot for AM', async () => {
    vi.mocked(slotRepo.findById).mockResolvedValue(makeSlot());

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      slotId: 'slot-1',
      data: { capacity: 3 },
      actor: makeActor(),
    });

    expect(result.capacity).toBe(3);
    expect(slotRepo.update).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'availability_slot.updated' }),
    );
  });

  it('should throw AVAILABILITY_SLOT_NOT_FOUND when slot does not exist', async () => {
    vi.mocked(slotRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        slotId: 'slot-999',
        data: { capacity: 2 },
        actor: makeActor(),
      }),
    ).rejects.toThrow(AvailabilitySlotNotFoundError);
  });

  it('should throw AVAILABILITY_SLOT_OVERLAP when time changes conflict', async () => {
    vi.mocked(slotRepo.findById).mockResolvedValue(makeSlot());
    vi.mocked(slotRepo.findByDateRange).mockResolvedValue([
      makeSlot({ id: 'slot-2', startTime: '13:00', endTime: '15:00' }),
    ]);

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        slotId: 'slot-1',
        data: { startTime: '13:00', endTime: '16:00' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(AvailabilitySlotOverlapError);
  });
});
