import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/create-service-group.use-case';
import type { IServiceGroupRepository } from '../../../src/modules/service-group/domain/service-group.repository';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AppointmentNotFoundError } from '../../../src/modules/appointment/domain/appointment.errors';
import {
  GroupSizeTooSmallError,
  AppointmentInvalidStatusError,
  PriorityDateTooCloseError,
} from '../../../src/modules/service-group/domain/service-group.errors';

function makeAppointmentEntity(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    inspectorId: null,
    status: 'AWAITING_INSPECTOR',
    scheduledDate: new Date('2026-04-01'),
    timeSlot: '09:00-10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
    priceAmount: 150,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    createdByUserId: 'user-1',
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeAppointmentWithRelations(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentWithRelations {
  return {
    appointment: makeAppointmentEntity(overrides),
    contact: null,
    restrictions: [],
  };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeAppointmentIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `appt-${i + 1}`);
}

// Future date far enough for PRIORITY_24H
const farFutureDate = '2026-06-01';

describe('CreateServiceGroupUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let appointmentRepo: IAppointmentRepository;
  let auditService: AuditService;
  let useCase: CreateServiceGroupUseCase;

  beforeEach(() => {
    serviceGroupRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      acceptOptimistic: vi.fn(),
      findPublishedForInspector: vi.fn(),
      countPublishedForInspector: vi.fn(),
      linkAppointments: vi.fn(),
      unlinkAppointments: vi.fn(),
      scheduleAppointments: vi.fn(),
    };
    appointmentRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;

    useCase = new CreateServiceGroupUseCase(
      serviceGroupRepo,
      appointmentRepo,
      auditService,
    );
  });

  it('should create a service group with 5 valid appointments (happy path)', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    const result = await useCase.execute({
      appointmentIds,
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      actor: makeActor(),
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe('DRAFT');
    expect(result.groupSize).toBe(5);
    expect(result.tenantId).toBe('tenant-1');
    expect(result.serviceTypeId).toBe('svc-type-1');
    expect(result.priorityMode).toBe('STANDARD');
    expect(result.priorityExpiresAt).toBeNull();
    expect(serviceGroupRepo.save).toHaveBeenCalledOnce();
    expect(serviceGroupRepo.linkAppointments).toHaveBeenCalledWith(
      appointmentIds,
      expect.any(String),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'service_group.created' }),
    );
  });

  it('should reject non-AM/OP actors', async () => {
    await expect(
      useCase.execute({
        appointmentIds: makeAppointmentIds(5),
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP role', async () => {
    await expect(
      useCase.execute({
        appointmentIds: makeAppointmentIds(5),
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw AppointmentNotFoundError when an appointment is missing', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-1' }),
    );
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(null);

    await expect(
      useCase.execute({
        appointmentIds: ['appt-1', 'appt-missing', 'appt-3', 'appt-4', 'appt-5'],
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  it('should throw when appointment is not AWAITING_INSPECTOR (validator)', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 4; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }
    // 5th appointment has wrong status
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-5', status: 'DRAFT' }),
    );

    await expect(
      useCase.execute({
        appointmentIds,
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentInvalidStatusError);
  });

  it('should throw GroupSizeTooSmallError when fewer than 5 appointments', async () => {
    const appointmentIds = makeAppointmentIds(3);
    for (let i = 0; i < 3; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    await expect(
      useCase.execute({
        appointmentIds,
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        actor: makeActor(),
      }),
    ).rejects.toThrow(GroupSizeTooSmallError);
  });

  it('should throw PriorityDateTooCloseError for PRIORITY_24H with close date', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    // Use a date that is less than 24h from now
    const tooCloseDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const dateStr = tooCloseDate.toISOString().split('T')[0];

    await expect(
      useCase.execute({
        appointmentIds,
        serviceTypeId: 'svc-type-1',
        scheduledDate: dateStr,
        timeWindow: '09:00-12:00',
        priorityMode: 'PRIORITY_24H',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PriorityDateTooCloseError);
  });

  it('should set priorityExpiresAt for PRIORITY_24H with valid date', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    const result = await useCase.execute({
      appointmentIds,
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'PRIORITY_24H',
      actor: makeActor(),
    });

    expect(result.priorityExpiresAt).not.toBeNull();
    expect(result.priorityMode).toBe('PRIORITY_24H');
    // priorityExpiresAt should be scheduledDate - 24h
    const expectedExpiry = new Date(new Date(farFutureDate).getTime() - 24 * 60 * 60 * 1000);
    expect(result.priorityExpiresAt!.getTime()).toBe(expectedExpiry.getTime());
  });

  it('should allow OP role to create group', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    const result = await useCase.execute({
      appointmentIds,
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe('DRAFT');
  });

  it('should call audit log on success', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    await useCase.execute({
      appointmentIds,
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      actor: makeActor({ userId: 'actor-am' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.created',
        actorType: 'USER',
        actorId: 'actor-am',
        entityType: 'ServiceGroup',
        tenantId: 'tenant-1',
        after: expect.objectContaining({
          status: 'DRAFT',
          groupSize: 5,
          serviceTypeId: 'svc-type-1',
        }),
      }),
    );
  });
});
