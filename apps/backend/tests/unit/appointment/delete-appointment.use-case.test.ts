import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/delete-appointment.use-case';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuthContext } from '@properfy/shared';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import {
  AppointmentNotFoundError,
  AppointmentNotDraftError,
} from '../../../src/modules/appointment/domain/appointment.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

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
    status: 'DRAFT',
    scheduledDate: new Date('2026-04-10'),
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
    cancellationReasonCode: null,
    rejectionReasonCode: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
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
    userId: 'user-am',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('DeleteAppointmentUseCase', () => {
  let useCase: DeleteAppointmentUseCase;
  let appointmentRepo: IAppointmentRepository;
  let auditService: AuditService;

  beforeEach(() => {
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
      findScheduledOnDate: vi.fn(),
      findAllContacts: vi.fn(),
      countContacts: vi.fn(),
      findContactById: vi.fn(),
      findDuplicateForImport: vi.fn(),
    };
    auditService = { log: vi.fn() };
    const authorizationService = new AuthorizationService(auditService);
    useCase = new DeleteAppointmentUseCase(appointmentRepo, auditService, authorizationService);
  });

  it('should soft-delete a DRAFT appointment when actor is AM', async () => {
    const record = makeAppointmentWithRelations({ status: 'DRAFT' });
    vi.mocked(appointmentRepo.findById).mockResolvedValue(record);
    vi.mocked(appointmentRepo.update).mockResolvedValue(undefined);

    await useCase.execute({
      appointmentId: 'appt-1',
      actor: makeActor(),
    });

    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      { deletedAt: expect.any(Date) },
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.deleted',
        actorType: 'USER',
        actorId: 'user-am',
        entityType: 'Appointment',
        entityId: 'appt-1',
        tenantId: 'tenant-1',
      }),
    );
  });

  it('should throw ForbiddenError when actor is not AM', async () => {
    const roles = ['OP', 'CL_ADMIN', 'CL_USER', 'INSP'] as const;

    for (const role of roles) {
      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          actor: makeActor({ role, tenantId: 'tenant-1' }),
        }),
      ).rejects.toThrow(ForbiddenError);
    }

    expect(appointmentRepo.findById).not.toHaveBeenCalled();
  });

  it('should throw AppointmentNotFoundError when appointment does not exist', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        appointmentId: 'appt-missing',
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  it('should throw AppointmentNotFoundError when appointment is already soft-deleted', async () => {
    const record = makeAppointmentWithRelations({ deletedAt: new Date() });
    vi.mocked(appointmentRepo.findById).mockResolvedValue(record);

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  it('should throw AppointmentNotDraftError when appointment is not in DRAFT status', async () => {
    const statuses = ['AWAITING_INSPECTOR', 'SCHEDULED', 'DONE', 'CANCELLED', 'REJECTED'] as const;

    for (const status of statuses) {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ status }),
      );

      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          actor: makeActor(),
        }),
      ).rejects.toThrow(AppointmentNotDraftError);
    }
  });

  it('should include before/after state in audit log', async () => {
    const record = makeAppointmentWithRelations({ status: 'DRAFT' });
    vi.mocked(appointmentRepo.findById).mockResolvedValue(record);
    vi.mocked(appointmentRepo.update).mockResolvedValue(undefined);

    await useCase.execute({
      appointmentId: 'appt-1',
      actor: makeActor(),
    });

    const auditCall = vi.mocked(auditService.log).mock.calls[0][0];
    expect(auditCall.before).toEqual({
      id: 'appt-1',
      status: 'DRAFT',
      deletedAt: null,
    });
    expect(auditCall.after).toEqual({
      id: 'appt-1',
      status: 'DRAFT',
      deletedAt: expect.any(String),
    });
  });
});
