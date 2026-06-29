import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetPortalDataUseCase } from '../../../src/modules/tenant-portal/application/use-cases/get-portal-data.use-case';
import type { ITenantPortalTokenRepository } from '../../../src/modules/tenant-portal/domain/tenant-portal-token.repository';
import type { ITenantPortalActivityRepository } from '../../../src/modules/tenant-portal/domain/tenant-portal-activity.repository';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import { TenantPortalActivityEntity } from '../../../src/modules/tenant-portal/domain/tenant-portal-activity.entity';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { AppointmentRestrictionEntity } from '../../../src/modules/appointment/domain/appointment-restriction.entity';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
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

function makeContact(): AppointmentContactEntity {
  return new AppointmentContactEntity({
    id: 'contact-1',
    appointmentId: 'appt-1',
    contactId: null,
    role: 'TENANT',
    isPrimary: true,
    snapshotName: 'John Smith',
    snapshotEmail: 'john@example.com',
    snapshotPhone: '+61400000000',
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

function makeProperty(): PropertyEntity {
  return new PropertyEntity({
    id: 'property-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyCode: 'PROP-001',
    type: 'HOUSE',
    street: '123 Main St',
    addressLine2: null,
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'AU',
    lat: null,
    lng: null,
    geocodingStatus: 'PENDING',
    notes: null,
    rulesJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

function makeServiceType(): ServiceTypeEntity {
  return new ServiceTypeEntity({
    id: 'svc-type-1',
    code: 'ROUTINE',
    name: 'Routine Inspection',
    flowType: 'ROUTINE',
    requiresTenantConfirmation: true,
    status: 'ACTIVE',
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
    expiresAt: '2026-04-01T00:00:00.000Z',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    ...overrides,
  };
}

function makeTenantEntity(overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {}): TenantEntity {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Sunrise Property Group',
    legalName: 'Sunrise Property Group Pty Ltd',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    settingsJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

describe('GetPortalDataUseCase', () => {
  let tokenRepo: ITenantPortalTokenRepository;
  let activityRepo: ITenantPortalActivityRepository;
  let appointmentRepo: IAppointmentRepository;
  let propertyRepo: IPropertyRepository;
  let serviceTypeRepo: IServiceTypeRepository;
  let tenantRepo: ITenantRepository;
  let useCase: GetPortalDataUseCase;

  beforeEach(() => {
    tokenRepo = {
      findByTokenHash: vi.fn(),
      findActiveByAppointmentId: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
      updateLastAccessedAt: vi.fn(),
      revokeAllForAppointment: vi.fn(),
      markUsed: vi.fn(),
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
    propertyRepo = {
      findById: vi.fn(),
      findByPropertyCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    serviceTypeRepo = {
      findById: vi.fn(),
      findByCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    tenantRepo = {
      findById: vi.fn().mockResolvedValue(makeTenantEntity()),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new GetPortalDataUseCase(tokenRepo, activityRepo, appointmentRepo, propertyRepo, serviceTypeRepo, tenantRepo);
  });

  it('should return full portal data for valid token', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, true, true),
    );
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction).mockResolvedValue(null);

    const result = await useCase.execute(makeInput());

    expect(result.token).toEqual({ status: 'ACTIVE', isReadOnly: false, isExpired: false, canRequestNewLink: false, expiresAt: '2026-04-01T00:00:00.000Z' });
    expect(result.appointment.id).toBe('appt-1');
    expect(result.appointment.status).toBe('DRAFT');
    expect(result.appointment.scheduledDate).toEqual(new Date('2026-04-01'));
    expect(result.appointment.timeSlot).toBe('09:00-10:00');
    expect(result.appointment.tenantConfirmationStatus).toBe('PENDING');
    expect(result.appointment.keyRequired).toBe(false);
    expect(result.appointment.meetingLocation).toBeNull();
    expect(result.appointment.notes).toBe('Some notes');
    expect(result.appointment.serviceType).toEqual({
      id: 'svc-type-1',
      name: 'Routine Inspection',
      code: 'ROUTINE',
    });
    expect(result.appointment.property).toEqual({
      id: 'property-1',
      propertyCode: 'PROP-001',
      type: 'HOUSE',
      street: '123 Main St',
      addressLine2: null,
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
    });
    expect(result.contact).toEqual({
      tenantName: 'John Smith',
      primaryEmail: 'john@example.com',
      primaryPhone: '+61400000000',
    });
    expect(result.restrictions).toEqual({
      isHome: true,
      unavailableDaysJson: ['Monday'],
      unavailableHoursJson: ['08:00-09:00'],
      notes: 'Dog at home',
      source: 'TENANT_PORTAL',
    });
    expect(result.existingResponse).toBeUndefined();
  });

  it('should return null contact when no contact exists', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, false, false),
    );
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction).mockResolvedValue(null);

    const result = await useCase.execute(makeInput());

    expect(result.contact).toBeNull();
    expect(result.restrictions).toBeNull();
  });

  it('should record VIEW activity', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction).mockResolvedValue(null);

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
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction).mockResolvedValue(null);

    await useCase.execute(makeInput());

    expect(tokenRepo.updateLastAccessedAt).toHaveBeenCalledOnce();
    expect(tokenRepo.updateLastAccessedAt).toHaveBeenCalledWith('token-1', 'appt-1', expect.any(Date));
  });

  it('should throw PortalAppointmentInactiveError when appointment not found', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should pass null tenantId to findById', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction).mockResolvedValue(null);

    await useCase.execute(makeInput());

    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
  });

  it('should return only the first restriction as single object (portal API contract)', async () => {
    const restriction2 = new AppointmentRestrictionEntity({
      id: 'restriction-2',
      appointmentId: 'appt-1',
      isHome: false,
      unavailableDaysJson: ['Friday'],
      unavailableHoursJson: ['14:00-16:00'],
      notes: 'Away in afternoon',
      source: 'OPERATOR',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(appointmentRepo.findById).mockResolvedValue({
      appointment: makeAppointmentEntity(),
      contact: makeContact(),
      restrictions: [makeRestriction(), restriction2],
    });
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction).mockResolvedValue(null);

    const result = await useCase.execute(makeInput());

    // Portal API returns single restriction object, not array
    expect(result.restrictions).toEqual({
      isHome: true,
      unavailableDaysJson: ['Monday'],
      unavailableHoursJson: ['08:00-09:00'],
      notes: 'Dog at home',
      source: 'TENANT_PORTAL',
    });
  });

  it('should include expiresAt in token response', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction).mockResolvedValue(null);

    const result = await useCase.execute(makeInput({ expiresAt: '2026-05-01T12:00:00.000Z' }));
    expect(result.token.expiresAt).toBe('2026-05-01T12:00:00.000Z');
  });

  it('should set isExpired=false and canRequestNewLink=false for ACTIVE tokens', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction).mockResolvedValue(null);

    const result = await useCase.execute(makeInput({ tokenStatus: 'ACTIVE' }));

    expect(result.token.isExpired).toBe(false);
    expect(result.token.canRequestNewLink).toBe(false);
  });

  it('should set isExpired=true and canRequestNewLink=true for EXPIRED tokens', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction).mockResolvedValue(null);

    const result = await useCase.execute(makeInput({ tokenStatus: 'EXPIRED', isReadOnly: true }));

    expect(result.token.isExpired).toBe(true);
    expect(result.token.canRequestNewLink).toBe(true);
  });

  it('should return token status from input for read-only tokens', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction).mockResolvedValue(null);

    const result = await useCase.execute(
      makeInput({ isReadOnly: true, tokenStatus: 'EXPIRED' }),
    );

    expect(result.token).toEqual({ status: 'EXPIRED', isReadOnly: true, isExpired: true, canRequestNewLink: true, expiresAt: '2026-04-01T00:00:00.000Z' });
  });

  it('should return the latest existing response mapped from portal activity history', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction)
      .mockResolvedValueOnce(
        new TenantPortalActivityEntity({
          id: 'act-confirm',
          appointmentId: 'appt-1',
          tenantPortalTokenId: 'token-1',
          action: 'CONFIRM',
          previousValuesJson: { tenantConfirmationStatus: 'PENDING' },
          newValuesJson: { tenantConfirmationStatus: 'CONFIRMED' },
          ipAddress: null,
          userAgent: null,
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
        }),
      )
      .mockResolvedValueOnce(
        new TenantPortalActivityEntity({
          id: 'act-reschedule',
          appointmentId: 'appt-1',
          tenantPortalTokenId: 'token-1',
          action: 'RESCHEDULE',
          previousValuesJson: { tenantConfirmationStatus: 'PENDING' },
          newValuesJson: { scheduledDate: '2026-04-10', timeSlot: '13:00-15:00' },
          ipAddress: null,
          userAgent: null,
          createdAt: new Date('2026-03-22T09:00:00.000Z'),
        }),
      )
      .mockResolvedValueOnce(null);

    const result = await useCase.execute(makeInput());

    expect(result.existingResponse).toEqual({
      type: 'RESCHEDULE',
      createdAt: '2026-03-22T09:00:00.000Z',
      summary: 'Tenant requested reschedule to 2026-04-10 13:00-15:00',
    });
  });

  it('should map unavailability activity to UNAVAILABLE existingResponse', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        new TenantPortalActivityEntity({
          id: 'act-unavailable',
          appointmentId: 'appt-1',
          tenantPortalTokenId: 'token-1',
          action: 'UNAVAILABLE_REPORTED',
          previousValuesJson: { tenantConfirmationStatus: 'PENDING' },
          newValuesJson: { tenantConfirmationStatus: 'UNAVAILABLE' },
          ipAddress: null,
          userAgent: null,
          createdAt: new Date('2026-03-21T12:30:00.000Z'),
        }),
      );

    const result = await useCase.execute(makeInput());

    expect(result.existingResponse).toEqual({
      type: 'UNAVAILABLE',
      createdAt: '2026-03-21T12:30:00.000Z',
      summary: 'Tenant reported unavailability',
    });
  });

  it('should return tenant.name and tenant.timezone in the response (T013)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction).mockResolvedValue(null);

    const result = await useCase.execute(makeInput());

    expect(result.tenant).toEqual({
      name: 'Sunrise Property Group',
      timezone: 'Australia/Sydney',
    });
  });

  it('should return tenant block with null name when tenant not found (T013)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    vi.mocked(propertyRepo.findById).mockResolvedValue(makeProperty());
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());
    vi.mocked(activityRepo.findLatestByTokenAndAction).mockResolvedValue(null);

    const result = await useCase.execute(makeInput());

    expect(result.tenant).toEqual({
      name: null,
      timezone: 'Australia/Sydney',
    });
  });
});
