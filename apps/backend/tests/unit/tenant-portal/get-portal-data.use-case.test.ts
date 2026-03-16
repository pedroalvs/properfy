import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetPortalDataUseCase } from '../../../src/modules/tenant-portal/application/use-cases/get-portal-data.use-case';
import type { ITenantPortalTokenRepository } from '../../../src/modules/tenant-portal/domain/tenant-portal-token.repository';
import type { ITenantPortalActivityRepository } from '../../../src/modules/tenant-portal/domain/tenant-portal-activity.repository';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { AppointmentRestrictionEntity } from '../../../src/modules/appointment/domain/appointment-restriction.entity';
import { PortalAppointmentInactiveError } from '../../../src/modules/tenant-portal/domain/tenant-portal.errors';

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
    scheduledDate: new Date('2026-04-01'),
    timeSlot: '09:00-10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
    priceAmount: 150,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: 'Some notes',
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
    unavailableDaysJson: ['Monday'],
    unavailableHoursJson: ['08:00-09:00'],
    notes: 'Dog at home',
    source: 'TENANT_PORTAL',
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

function makeInput(overrides: Partial<Parameters<GetPortalDataUseCase['execute']>[0]> = {}) {
  return {
    tokenId: 'token-1',
    appointmentId: 'appt-1',
    isReadOnly: false,
    tokenStatus: 'ACTIVE',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    ...overrides,
  };
}

describe('GetPortalDataUseCase', () => {
  let tokenRepo: ITenantPortalTokenRepository;
  let activityRepo: ITenantPortalActivityRepository;
  let appointmentRepo: IAppointmentRepository;
  let useCase: GetPortalDataUseCase;

  beforeEach(() => {
    tokenRepo = {
      findByTokenHash: vi.fn(),
      findActiveByAppointmentId: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
      updateLastAccessedAt: vi.fn(),
      revokeAllForAppointment: vi.fn(),
    };
    activityRepo = {
      save: vi.fn(),
      findLatestByTokenAndAction: vi.fn(),
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
    useCase = new GetPortalDataUseCase(tokenRepo, activityRepo, appointmentRepo);
  });

  it('should return full portal data for valid token', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, true, true),
    );

    const result = await useCase.execute(makeInput());

    expect(result.token).toEqual({ status: 'ACTIVE', isReadOnly: false });
    expect(result.appointment.id).toBe('appt-1');
    expect(result.appointment.status).toBe('DRAFT');
    expect(result.appointment.scheduledDate).toEqual(new Date('2026-04-01'));
    expect(result.appointment.timeSlot).toBe('09:00-10:00');
    expect(result.appointment.serviceTypeId).toBe('svc-type-1');
    expect(result.appointment.tenantConfirmationStatus).toBe('PENDING');
    expect(result.appointment.keyRequired).toBe(false);
    expect(result.appointment.meetingLocation).toBeNull();
    expect(result.appointment.notes).toBe('Some notes');
    expect(result.contact).toEqual({
      tenantName: 'John Smith',
      primaryEmail: 'john@example.com',
      secondaryEmail: null,
      primaryPhone: '+61400000000',
      secondaryPhone: null,
    });
    expect(result.restrictions).toEqual({
      isHome: true,
      unavailableDaysJson: ['Monday'],
      unavailableHoursJson: ['08:00-09:00'],
      notes: 'Dog at home',
      source: 'TENANT_PORTAL',
    });
  });

  it('should return null contact when no contact exists', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, false, false),
    );

    const result = await useCase.execute(makeInput());

    expect(result.contact).toBeNull();
    expect(result.restrictions).toBeNull();
  });

  it('should record VIEW activity', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute(makeInput());

    expect(activityRepo.save).toHaveBeenCalledOnce();
    const savedActivity = vi.mocked(activityRepo.save).mock.calls[0][0];
    expect(savedActivity.action).toBe('VIEW');
    expect(savedActivity.appointmentId).toBe('appt-1');
    expect(savedActivity.tenantPortalTokenId).toBe('token-1');
    expect(savedActivity.ipAddress).toBe('192.168.1.1');
    expect(savedActivity.userAgent).toBe('Mozilla/5.0');
    expect(savedActivity.previousValuesJson).toBeNull();
    expect(savedActivity.newValuesJson).toBeNull();
  });

  it('should update lastAccessedAt on the token', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute(makeInput());

    expect(tokenRepo.updateLastAccessedAt).toHaveBeenCalledOnce();
    expect(tokenRepo.updateLastAccessedAt).toHaveBeenCalledWith('token-1', expect.any(Date));
  });

  it('should throw PortalAppointmentInactiveError when appointment not found', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should pass null tenantId to findById', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute(makeInput());

    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
  });

  it('should return token status from input for read-only tokens', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    const result = await useCase.execute(
      makeInput({ isReadOnly: true, tokenStatus: 'EXPIRED' }),
    );

    expect(result.token).toEqual({ status: 'EXPIRED', isReadOnly: true });
  });
});
