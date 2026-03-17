import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/get-appointment.use-case';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { AuthContext } from '@properfy/shared';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { AppointmentRestrictionEntity } from '../../../src/modules/appointment/domain/appointment-restriction.entity';
import {
  AppointmentNotFoundError,
  AppointmentAccessDeniedError,
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

function makeRestriction(): AppointmentRestrictionEntity {
  return new AppointmentRestrictionEntity({
    id: 'restriction-1',
    appointmentId: 'appt-1',
    isHome: true,
    unavailableDaysJson: null,
    unavailableHoursJson: null,
    notes: null,
    source: 'OPERATOR',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeAppointmentWithRelations(
  appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
  withContact = true,
  withRestrictions = false,
): AppointmentWithRelations {
  return {
    appointment: makeAppointmentEntity(appointmentOverrides),
    contact: withContact ? makeContact() : null,
    restrictions: withRestrictions ? [makeRestriction()] : [],
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

describe('GetAppointmentUseCase', () => {
  let appointmentRepo: IAppointmentRepository;
  let useCase: GetAppointmentUseCase;

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
    useCase = new GetAppointmentUseCase(appointmentRepo);
  });

  it('should allow AM to get any appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.id).toBe('appt-1');
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
  });

  it('should allow CL_ADMIN to get their own tenant appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.id).toBe('appt-1');
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', 'tenant-1');
  });

  it('should deny CL_ADMIN access to another tenant appointment', async () => {
    // Appointment belongs to tenant-other
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ tenantId: 'tenant-other' }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  it('should allow INSP to get their assigned appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ inspectorId: 'inspector-user-1' }),
    );

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      actor: makeActor({ role: 'INSP', userId: 'inspector-user-1', inspectorId: 'inspector-user-1' }),
    });

    expect(result.id).toBe('appt-1');
    expect(result.inspectorId).toBe('inspector-user-1');
  });

  it('should deny INSP access to non-assigned appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ inspectorId: 'other-inspector' }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        actor: makeActor({ role: 'INSP', userId: 'inspector-user-1', inspectorId: 'inspector-user-1' }),
      }),
    ).rejects.toThrow(AppointmentAccessDeniedError);
  });

  it('should throw AppointmentNotFoundError when appointment does not exist', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        appointmentId: 'nonexistent',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  it('should throw AppointmentNotFoundError for soft-deleted appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ deletedAt: new Date() }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  it('should return contact and restrictions', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, true, true),
    );

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.contact).not.toBeNull();
    expect(result.contact?.tenantName).toBe('John Smith');
    expect(result.restrictions).toHaveLength(1);
    expect(result.restrictions[0].source).toBe('OPERATOR');
  });

  it('should return null contact when contact does not exist', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, false, false),
    );

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.contact).toBeNull();
    expect(result.restrictions).toHaveLength(0);
  });

  it('should deny TNT role access', async () => {
    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        actor: makeActor({ role: 'TNT' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
