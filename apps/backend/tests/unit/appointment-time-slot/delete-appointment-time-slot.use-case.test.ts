import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteAppointmentTimeSlotUseCase } from '../../../src/modules/appointment-time-slot/application/use-cases/delete-appointment-time-slot.use-case';
import type { IAppointmentTimeSlotRepository } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.repository';
import { AppointmentTimeSlotEntity } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.entity';
import { AppointmentTimeSlotNotFoundError } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.errors';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
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

describe('DeleteAppointmentTimeSlotUseCase', () => {
  let timeSlotRepo: IAppointmentTimeSlotRepository;
  let auditService: AuditService;
  let useCase: DeleteAppointmentTimeSlotUseCase;

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

  const inspActor: AuthContext = {
    userId: 'insp-1',
    tenantId: 'tenant-1',
    role: 'INSP',
    branchId: null,
    inspectorId: 'inspector-1',
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
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new DeleteAppointmentTimeSlotUseCase(timeSlotRepo, auditService);
  });

  it('should soft delete a slot as AM', async () => {
    vi.mocked(timeSlotRepo.findById).mockResolvedValue(makeSlotEntity());

    await useCase.execute({ timeSlotId: 'slot-1', actor: amActor });

    expect(timeSlotRepo.softDelete).toHaveBeenCalledWith('slot-1');
  });

  it('should soft delete a slot as OP', async () => {
    vi.mocked(timeSlotRepo.findById).mockResolvedValue(makeSlotEntity());

    await useCase.execute({ timeSlotId: 'slot-1', actor: opActor });

    expect(timeSlotRepo.softDelete).toHaveBeenCalledWith('slot-1');
  });

  it('should soft delete a slot as CL_ADMIN for own tenant', async () => {
    vi.mocked(timeSlotRepo.findById).mockResolvedValue(makeSlotEntity({ tenantId: 'tenant-1' }));

    await useCase.execute({ timeSlotId: 'slot-1', actor: clAdminActor });

    expect(timeSlotRepo.softDelete).toHaveBeenCalledWith('slot-1');
  });

  it('should log audit event after deletion', async () => {
    const slot = makeSlotEntity();
    vi.mocked(timeSlotRepo.findById).mockResolvedValue(slot);

    await useCase.execute({ timeSlotId: 'slot-1', actor: amActor });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment_time_slot.deleted',
        actorType: 'USER',
        actorId: 'admin-1',
        tenantId: 'tenant-1',
        entityType: 'AppointmentTimeSlot',
        entityId: 'slot-1',
      }),
    );
  });

  it('should throw AppointmentTimeSlotNotFoundError when slot does not exist', async () => {
    vi.mocked(timeSlotRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ timeSlotId: 'slot-nonexistent', actor: amActor }),
    ).rejects.toThrow(AppointmentTimeSlotNotFoundError);
  });

  it('should throw ForbiddenError when CL_ADMIN tries to delete slot of another tenant', async () => {
    vi.mocked(timeSlotRepo.findById).mockResolvedValue(
      makeSlotEntity({ tenantId: 'tenant-other' }),
    );

    await expect(
      useCase.execute({ timeSlotId: 'slot-1', actor: clAdminActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP role with ForbiddenError', async () => {
    await expect(
      useCase.execute({ timeSlotId: 'slot-1', actor: inspActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject CL_USER role with ForbiddenError', async () => {
    await expect(
      useCase.execute({ timeSlotId: 'slot-1', actor: clUserActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject TNT role with ForbiddenError', async () => {
    await expect(
      useCase.execute({ timeSlotId: 'slot-1', actor: tntActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should not call softDelete when slot is not found', async () => {
    vi.mocked(timeSlotRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ timeSlotId: 'slot-1', actor: amActor }),
    ).rejects.toThrow();

    expect(timeSlotRepo.softDelete).not.toHaveBeenCalled();
  });

  it('should not call softDelete when CL_ADMIN tenant mismatch', async () => {
    vi.mocked(timeSlotRepo.findById).mockResolvedValue(
      makeSlotEntity({ tenantId: 'tenant-other' }),
    );

    await expect(
      useCase.execute({ timeSlotId: 'slot-1', actor: clAdminActor }),
    ).rejects.toThrow();

    expect(timeSlotRepo.softDelete).not.toHaveBeenCalled();
  });
});
