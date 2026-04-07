import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateAvailabilitySlotUseCase } from '../../../src/modules/inspector/application/use-cases/create-availability-slot.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IAvailabilitySlotRepository } from '../../../src/modules/inspector/domain/availability-slot.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { AvailabilitySlotEntity } from '../../../src/modules/inspector/domain/availability-slot.entity';
import {
  InspectorNotFoundError,
  AvailabilitySlotOverlapError,
} from '../../../src/modules/inspector/domain/inspector.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeInspector(
  overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {},
): InspectorEntity {
  return new InspectorEntity({
    id: 'inspector-1',
    name: 'John Inspector',
    email: 'john@example.com',
    phone: '+61400000000',
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: ['service-1'],
    clientEligibilityJson: ['tenant-1'],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

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
    inspectorId: null,
    ...overrides,
  };
}

describe('CreateAvailabilitySlotUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let slotRepo: IAvailabilitySlotRepository;
  let auditService: AuditService;
  let useCase: CreateAvailabilitySlotUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      linkUserId: vi.fn(),
      findByRegionId: vi.fn(),
    };
    slotRepo = {
      findById: vi.fn(),
      findByDateRange: vi.fn().mockResolvedValue([]),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new CreateAvailabilitySlotUseCase(inspectorRepo, slotRepo, auditService);
  });

  it('should create slot for AM', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      date: new Date('2026-04-01'),
      startTime: '09:00',
      endTime: '12:00',
      actor: makeActor(),
    });

    expect(result.status).toBe('AVAILABLE');
    expect(result.inspectorId).toBe('inspector-1');
    expect(result.startTime).toBe('09:00');
    expect(result.endTime).toBe('12:00');
    expect(slotRepo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'availability_slot.created' }),
    );
  });

  it('should throw INSPECTOR_NOT_FOUND when inspector does not exist', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: 'inspector-999',
        date: new Date('2026-04-01'),
        startTime: '09:00',
        endTime: '12:00',
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorNotFoundError);
  });

  it('should throw AVAILABILITY_SLOT_OVERLAP when slot overlaps', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(slotRepo.findByDateRange).mockResolvedValue([
      makeSlot({ startTime: '08:00', endTime: '10:00' }),
    ]);

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        date: new Date('2026-04-01'),
        startTime: '09:00',
        endTime: '12:00',
        actor: makeActor(),
      }),
    ).rejects.toThrow(AvailabilitySlotOverlapError);
  });

  it('should create slot for INSP own inspector', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      date: new Date('2026-04-01'),
      startTime: '09:00',
      endTime: '12:00',
      actor: makeActor({ role: 'INSP', inspectorId: 'inspector-1' }),
    });

    expect(result.status).toBe('AVAILABLE');
    expect(result.inspectorId).toBe('inspector-1');
    expect(slotRepo.save).toHaveBeenCalled();
  });

  it('should throw ForbiddenError when INSP creates slot for another inspector', async () => {
    await expect(
      useCase.execute({
        inspectorId: 'other-inspector',
        date: new Date('2026-04-01'),
        startTime: '09:00',
        endTime: '12:00',
        actor: makeActor({ role: 'INSP', inspectorId: 'inspector-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError when INSP has no inspectorId', async () => {
    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        date: new Date('2026-04-01'),
        startTime: '09:00',
        endTime: '12:00',
        actor: makeActor({ role: 'INSP', inspectorId: null }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
