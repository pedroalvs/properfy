import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/update-appointment.use-case';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import {
  AppointmentNotFoundError,
  AppointmentUpdateNotAllowedError,
} from '../../../src/modules/appointment/domain/appointment.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeAppointmentEntity(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    inspectorId: null,
    status: 'DRAFT',
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

function makeContact(): AppointmentContactEntity {
  return new AppointmentContactEntity({
    id: 'contact-1',
    appointmentId: 'appt-1',
    tenantName: 'John Smith',
    primaryEmail: 'john@example.com',
    secondaryEmail: null,
    primaryPhone: '+61400000000',
    secondaryPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeAppointmentWithRelations(
  appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
  withContact = false,
): AppointmentWithRelations {
  return {
    appointment: makeAppointmentEntity(appointmentOverrides),
    contact: withContact ? makeContact() : null,
    restrictions: [],
  };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    role: 'CL_ADMIN',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('UpdateAppointmentUseCase', () => {
  let appointmentRepo: IAppointmentRepository;
  let auditService: AuditService;
  let useCase: UpdateAppointmentUseCase;

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
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateAppointmentUseCase(appointmentRepo, auditService);
  });

  it('should update a DRAFT appointment successfully', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      data: {
        timeSlot: '10:00-11:00',
        notes: 'Updated notes',
      },
      actor: makeActor(),
    });

    expect(result.id).toBe('appt-1');
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({ timeSlot: '10:00-11:00', notes: 'Updated notes' }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.updated',
        before: expect.any(Object),
        after: expect.any(Object),
      }),
    );
  });

  it('should update an AWAITING_INSPECTOR appointment successfully', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'AWAITING_INSPECTOR' }),
    );

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      data: { keyRequired: true },
      actor: makeActor(),
    });

    expect(result.id).toBe('appt-1');
    expect(appointmentRepo.update).toHaveBeenCalled();
  });

  it('should fail to update a SCHEDULED appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'SCHEDULED' }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        data: { notes: 'Cannot update' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentUpdateNotAllowedError);
  });

  it('should fail to update a DONE appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DONE' }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        data: { notes: 'Cannot update' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentUpdateNotAllowedError);
  });

  it('should fail to update a CANCELLED appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'CANCELLED' }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        data: { notes: 'Cannot update' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentUpdateNotAllowedError);
  });

  it('should update existing contact (upsert)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, true),
    );

    await useCase.execute({
      appointmentId: 'appt-1',
      data: {
        contact: {
          tenantName: 'Jane Doe',
          primaryEmail: 'jane@example.com',
        },
      },
      actor: makeActor(),
    });

    expect(appointmentRepo.updateContact).toHaveBeenCalledWith(
      'appt-1',
      expect.objectContaining({ tenantName: 'Jane Doe' }),
    );
    expect(appointmentRepo.saveContact).not.toHaveBeenCalled();
  });

  it('should create new contact when contact does not exist (upsert)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, false),
    );

    await useCase.execute({
      appointmentId: 'appt-1',
      data: {
        contact: {
          tenantName: 'New Contact',
          primaryEmail: 'new@example.com',
        },
      },
      actor: makeActor(),
    });

    expect(appointmentRepo.saveContact).toHaveBeenCalled();
    expect(appointmentRepo.updateContact).not.toHaveBeenCalled();
  });

  it('should delete restriction and create new one (upsert)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute({
      appointmentId: 'appt-1',
      data: {
        restriction: {
          isHome: true,
          source: 'OPERATOR',
          unavailableDays: ['2026-04-05'],
        },
      },
      actor: makeActor(),
    });

    expect(appointmentRepo.deleteRestrictionsByAppointmentId).toHaveBeenCalledWith('appt-1');
    expect(appointmentRepo.saveRestriction).toHaveBeenCalled();
  });

  it('should delete restriction when restriction is set to null', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute({
      appointmentId: 'appt-1',
      data: {
        restriction: null,
      },
      actor: makeActor(),
    });

    expect(appointmentRepo.deleteRestrictionsByAppointmentId).toHaveBeenCalledWith('appt-1');
    expect(appointmentRepo.saveRestriction).not.toHaveBeenCalled();
  });

  it('should not touch restrictions when restriction field is absent', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute({
      appointmentId: 'appt-1',
      data: { notes: 'Just notes' },
      actor: makeActor(),
    });

    expect(appointmentRepo.deleteRestrictionsByAppointmentId).not.toHaveBeenCalled();
    expect(appointmentRepo.saveRestriction).not.toHaveBeenCalled();
  });

  it('should include before and after in audit log', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute({
      appointmentId: 'appt-1',
      data: { notes: 'Changed notes' },
      actor: makeActor(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.updated',
        before: expect.objectContaining({ notes: null }),
        after: expect.objectContaining({ notes: 'Changed notes' }),
      }),
    );
  });

  it('should throw AppointmentNotFoundError when appointment does not exist', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        appointmentId: 'nonexistent',
        data: { notes: 'whatever' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  it('should deny INSP role', async () => {
    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        data: {},
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should deny CL_ADMIN access to appointment from different tenant', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ tenantId: 'tenant-other' }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        data: { notes: 'hacking' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });
});
