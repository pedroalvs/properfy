import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListEffectiveTimeSlotsUseCase } from '../../../src/modules/appointment-time-slot/application/use-cases/list-effective-time-slots.use-case';
import type { IAppointmentTimeSlotRepository } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.repository';
import { AppointmentTimeSlotEntity } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { AuthContext } from '@properfy/shared';

function makeSlotEntity(
  overrides: Partial<ConstructorParameters<typeof AppointmentTimeSlotEntity>[0]> = {},
): AppointmentTimeSlotEntity {
  return new AppointmentTimeSlotEntity({
    id: 'slot-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    label: 'Morning',
    startTime: '08:00',
    endTime: '12:00',
    sortOrder: 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

describe('ListEffectiveTimeSlotsUseCase', () => {
  let timeSlotRepo: IAppointmentTimeSlotRepository;
  let useCase: ListEffectiveTimeSlotsUseCase;

  const amActor: AuthContext = {
    userId: 'admin-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
  };

  const opActor: AuthContext = {
    userId: 'op-1',
    tenantId: null,
    role: 'OP',
    branchId: null,
    inspectorId: null,
  };

  const clAdminActor: AuthContext = {
    userId: 'cl-admin-1',
    tenantId: 'tenant-1',
    role: 'CL_ADMIN',
    branchId: null,
    inspectorId: null,
  };

  const clUserActor: AuthContext = {
    userId: 'cl-user-1',
    tenantId: 'tenant-1',
    role: 'CL_USER',
    branchId: null,
    inspectorId: null,
  };

  const tntActor: AuthContext = {
    userId: 'tnt-1',
    tenantId: 'tenant-1',
    role: 'TNT',
    branchId: null,
    inspectorId: null,
  };

  beforeEach(() => {
    timeSlotRepo = {
      create: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      findEffective: vi.fn(),
      softDelete: vi.fn(),
    };
    useCase = new ListEffectiveTimeSlotsUseCase(timeSlotRepo);
  });

  it('should return effective slots for a branch', async () => {
    const slots = [
      makeSlotEntity({ id: 'slot-1', label: 'Morning', startTime: '08:00', endTime: '12:00' }),
      makeSlotEntity({ id: 'slot-2', label: 'Afternoon', startTime: '13:00', endTime: '17:00', sortOrder: 2 }),
    ];
    vi.mocked(timeSlotRepo.findEffective).mockResolvedValue(slots);

    const result = await useCase.execute({
      branchId: 'branch-1',
      actor: amActor,
      tenantId: 'tenant-1',
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'slot-1',
      label: 'Morning',
      startTime: '08:00',
      endTime: '12:00',
      value: '08:00-12:00',
    });
    expect(result[1]).toEqual({
      id: 'slot-2',
      label: 'Afternoon',
      startTime: '13:00',
      endTime: '17:00',
      value: '13:00-17:00',
    });
  });

  it('should call findEffective with correct tenantId and branchId', async () => {
    vi.mocked(timeSlotRepo.findEffective).mockResolvedValue([]);

    await useCase.execute({
      branchId: 'branch-42',
      tenantId: 'tenant-5',
      actor: amActor,
    });

    expect(timeSlotRepo.findEffective).toHaveBeenCalledWith('tenant-5', 'branch-42');
  });

  it('should allow AM role', async () => {
    vi.mocked(timeSlotRepo.findEffective).mockResolvedValue([]);

    await expect(
      useCase.execute({ branchId: 'branch-1', tenantId: 'tenant-1', actor: amActor }),
    ).resolves.toEqual([]);
  });

  it('should allow OP role', async () => {
    vi.mocked(timeSlotRepo.findEffective).mockResolvedValue([]);

    await expect(
      useCase.execute({ branchId: 'branch-1', tenantId: 'tenant-1', actor: opActor }),
    ).resolves.toEqual([]);
  });

  it('should allow CL_ADMIN role', async () => {
    vi.mocked(timeSlotRepo.findEffective).mockResolvedValue([]);

    await expect(
      useCase.execute({ branchId: 'branch-1', actor: clAdminActor }),
    ).resolves.toEqual([]);
  });

  it('should allow CL_USER role', async () => {
    vi.mocked(timeSlotRepo.findEffective).mockResolvedValue([]);

    await expect(
      useCase.execute({ branchId: 'branch-1', actor: clUserActor }),
    ).resolves.toEqual([]);
  });

  it('should reject TNT role with ForbiddenError', async () => {
    await expect(
      useCase.execute({ branchId: 'branch-1', actor: tntActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP role with ForbiddenError', async () => {
    const inspActor: AuthContext = {
      userId: 'insp-1',
      tenantId: 'tenant-1',
      role: 'INSP',
      branchId: null,
      inspectorId: 'inspector-1',
    };

    await expect(
      useCase.execute({ branchId: 'branch-1', actor: inspActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError when CL_ADMIN provides a different tenantId', async () => {
    await expect(
      useCase.execute({
        branchId: 'branch-1',
        tenantId: 'tenant-other',
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should use CL_ADMIN own tenantId when no tenantId provided', async () => {
    vi.mocked(timeSlotRepo.findEffective).mockResolvedValue([]);

    await useCase.execute({ branchId: 'branch-1', actor: clAdminActor });

    expect(timeSlotRepo.findEffective).toHaveBeenCalledWith('tenant-1', 'branch-1');
  });

  it('should scope CL_USER to own tenant', async () => {
    await expect(
      useCase.execute({
        branchId: 'branch-1',
        tenantId: 'tenant-other',
        actor: clUserActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should use actor tenantId when AM does not provide tenantId', async () => {
    const amWithTenant: AuthContext = { ...amActor, tenantId: 'tenant-am' };
    vi.mocked(timeSlotRepo.findEffective).mockResolvedValue([]);

    await useCase.execute({ branchId: 'branch-1', actor: amWithTenant });

    expect(timeSlotRepo.findEffective).toHaveBeenCalledWith('tenant-am', 'branch-1');
  });
});
