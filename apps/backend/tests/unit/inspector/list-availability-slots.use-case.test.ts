import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListAvailabilitySlotsUseCase } from '../../../src/modules/inspector/application/use-cases/list-availability-slots.use-case';
import type { IAvailabilitySlotRepository } from '../../../src/modules/inspector/domain/availability-slot.repository';
import type { AuthContext } from '@properfy/shared';
import { AvailabilitySlotEntity } from '../../../src/modules/inspector/domain/availability-slot.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';

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

describe('ListAvailabilitySlotsUseCase', () => {
  let slotRepo: IAvailabilitySlotRepository;
  let useCase: ListAvailabilitySlotsUseCase;

  beforeEach(() => {
    slotRepo = {
      findById: vi.fn(),
      findByDateRange: vi.fn(),
      findAll: vi.fn().mockResolvedValue([makeSlot()]),
      count: vi.fn().mockResolvedValue(1),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new ListAvailabilitySlotsUseCase(slotRepo);
  });

  it('should return paginated slots for AM', async () => {
    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.data[0].inspectorId).toBe('inspector-1');
  });

  it('should reject CL_ADMIN with AUTH_FORBIDDEN', async () => {
    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        filters: {},
        pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
