import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateAppointmentTimeSlotUseCase } from '../../../src/modules/appointment-time-slot/application/use-cases/create-appointment-time-slot.use-case';
import type { IAppointmentTimeSlotRepository } from '../../../src/modules/appointment-time-slot/domain/appointment-time-slot.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { AuthContext } from '@properfy/shared';

describe('CreateAppointmentTimeSlotUseCase', () => {
  let timeSlotRepo: IAppointmentTimeSlotRepository;
  let auditService: AuditService;
  let useCase: CreateAppointmentTimeSlotUseCase;

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
    useCase = new CreateAppointmentTimeSlotUseCase(timeSlotRepo, auditService);
  });

  it('should create a time slot successfully as AM', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      label: 'Morning',
      startTime: '08:00',
      endTime: '12:00',
      sortOrder: 1,
      actor: amActor,
    });

    expect(result.tenantId).toBe('tenant-1');
    expect(result.branchId).toBe('branch-1');
    expect(result.label).toBe('Morning');
    expect(result.startTime).toBe('08:00');
    expect(result.endTime).toBe('12:00');
    expect(result.sortOrder).toBe(1);
    expect(result.isActive).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(timeSlotRepo.create).toHaveBeenCalledTimes(1);
  });

  it('should create a time slot successfully as OP', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      label: 'Afternoon',
      startTime: '13:00',
      endTime: '17:00',
      sortOrder: 2,
      actor: opActor,
    });

    expect(result.tenantId).toBe('tenant-1');
    expect(result.label).toBe('Afternoon');
    expect(timeSlotRepo.create).toHaveBeenCalledTimes(1);
  });

  it('should create a time slot as CL_ADMIN for own tenant', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      label: 'Evening',
      startTime: '17:00',
      endTime: '20:00',
      sortOrder: 3,
      actor: clAdminActor,
    });

    expect(result.tenantId).toBe('tenant-1');
    expect(timeSlotRepo.create).toHaveBeenCalledTimes(1);
  });

  it('should set branchId to null when not provided', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      label: 'All Day',
      startTime: '08:00',
      endTime: '18:00',
      sortOrder: 1,
      actor: amActor,
    });

    expect(result.branchId).toBeNull();
  });

  it('should log audit event after creation', async () => {
    await useCase.execute({
      tenantId: 'tenant-1',
      label: 'Morning',
      startTime: '08:00',
      endTime: '12:00',
      sortOrder: 1,
      actor: amActor,
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment_time_slot.created',
        actorType: 'USER',
        actorId: 'admin-1',
        tenantId: 'tenant-1',
        entityType: 'AppointmentTimeSlot',
      }),
    );
  });

  it('should reject INSP role with ForbiddenError', async () => {
    await expect(
      useCase.execute({
        label: 'Morning',
        startTime: '08:00',
        endTime: '12:00',
        sortOrder: 1,
        actor: inspActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject CL_USER role with ForbiddenError', async () => {
    await expect(
      useCase.execute({
        label: 'Morning',
        startTime: '08:00',
        endTime: '12:00',
        sortOrder: 1,
        actor: clUserActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject TNT role with ForbiddenError', async () => {
    await expect(
      useCase.execute({
        label: 'Morning',
        startTime: '08:00',
        endTime: '12:00',
        sortOrder: 1,
        actor: tntActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should scope CL_ADMIN to own tenant even when tenantId not provided', async () => {
    const result = await useCase.execute({
      label: 'Morning',
      startTime: '08:00',
      endTime: '12:00',
      sortOrder: 1,
      actor: clAdminActor,
    });

    expect(result.tenantId).toBe('tenant-1');
  });

  it('should throw ForbiddenError when CL_ADMIN tries to create for another tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-other',
        label: 'Morning',
        startTime: '08:00',
        endTime: '12:00',
        sortOrder: 1,
        actor: clAdminActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should allow AM to create for any tenant', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-99',
      label: 'Morning',
      startTime: '08:00',
      endTime: '12:00',
      sortOrder: 1,
      actor: amActor,
    });

    expect(result.tenantId).toBe('tenant-99');
  });
});
