import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetAppointmentDetailUseCase } from '../../../src/modules/inspector-execution/application/use-cases/get-appointment-detail.use-case';
import type {
  IAppointmentRepository,
  AppointmentWithRelations,
} from '../../../src/modules/appointment/domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../../src/modules/inspector-execution/domain/inspection-execution.repository';
import type { IServiceTypeReader } from '../../../src/modules/inspector-execution/domain/service-type-reader';
import type { IContactReader, ContactRegistryInfo } from '../../../src/modules/inspector-execution/domain/contact-reader';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { AppointmentRestrictionEntity } from '../../../src/modules/appointment/domain/appointment-restriction.entity';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionT1BlockedError,
} from '../../../src/modules/inspector-execution/domain/inspection-execution.errors';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import type { AuthContext } from '@properfy/shared';

function makeAppointmentEntity(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'st-1',
    inspectorId: 'insp-1',
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-03-21'),
    timeSlotStart: '09:00', timeSlotEnd: '11:00',
    keyRequired: false,
    meetingLocation: 'Front door',
    keyLocation: 'Lockbox #3',
    rentalTenantConfirmationStatus: 'CONFIRMED',
    priceAmount: 200,
    payoutAmount: 140,
    pricingRuleSnapshotJson: {},
    notes: null,
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

function makeContact(
  overrides: Partial<ConstructorParameters<typeof AppointmentContactEntity>[0]> = {},
): AppointmentContactEntity {
  return new AppointmentContactEntity({
    id: 'contact-1',
    appointmentId: 'appt-1',
    contactId: null,
    role: 'RENTAL_TENANT',
    isPrimary: true,
    snapshotName: 'John Smith',
    snapshotEmail: 'john@example.com',
    snapshotPhone: '+61400000000',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeRestriction(): AppointmentRestrictionEntity {
  return new AppointmentRestrictionEntity({
    id: 'restriction-1',
    appointmentId: 'appt-1',
    isHome: true,
    unavailableDaysJson: ['Monday'],
    unavailableHoursJson: ['08:00-09:00'],
    notes: 'Dog in backyard',
    source: 'RENTAL_TENANT',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeTenantEntity(
  overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {},
): TenantEntity {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Acme Realty',
    legalName: 'Acme Realty Pty Ltd',
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

function makeAppointmentWithRelations(
  appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
  withContact = true,
  withRestrictions = true,
): AppointmentWithRelations {
  const contact = withContact ? makeContact() : null;
  return {
    appointment: makeAppointmentEntity(appointmentOverrides),
    contact,
    contacts: contact ? [contact] : [],
    restrictions: withRestrictions ? [makeRestriction()] : [],
  };
}

function makeExecution(
  overrides: Partial<ConstructorParameters<typeof InspectionExecutionEntity>[0]> = {},
): InspectionExecutionEntity {
  return new InspectionExecutionEntity({
    id: 'exec-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    startedAt: new Date('2026-03-21T09:00:00Z'),
    finishedAt: null,
    resumedAt: null,
    startLatitude: -33.8688,
    startLongitude: 151.2093,
    finishLatitude: null,
    finishLongitude: null,
    geolocationDistanceMeters: null,
    checklistJson: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

const inspActor: AuthContext = {
  userId: 'insp-1',
  tenantId: null,
  role: 'INSP',
  branchId: null,
  inspectorId: 'insp-1',
};

describe('GetAppointmentDetailUseCase', () => {
  let appointmentRepo: IAppointmentRepository;
  let executionRepo: IInspectionExecutionRepository;
  let serviceTypeReader: IServiceTypeReader;
  let tenantRepo: ITenantRepository;
  let useCase: GetAppointmentDetailUseCase;

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

    executionRepo = {
      findByAppointmentId: vi.fn().mockResolvedValue(null),
      findByAppointmentIds: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };

    serviceTypeReader = {
      findById: vi.fn().mockResolvedValue({
        id: 'st-1',
        code: 'ROUTINE',
        name: 'Routine Inspection',
        flowType: 'ROUTINE',
      }),
      findByIds: vi.fn(),
    };

    tenantRepo = {
      findById: vi.fn().mockResolvedValue(makeTenantEntity()),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };

    const authorizationService = new AuthorizationService({ log: vi.fn() } as never);
    useCase = new GetAppointmentDetailUseCase(
      appointmentRepo,
      executionRepo,
      serviceTypeReader,
      authorizationService,
      tenantRepo,
    );
  });

  it('should return full appointment detail with contact, restrictions, and execution', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    const execution = makeExecution();
    vi.mocked(executionRepo.findByAppointmentId).mockResolvedValue(execution);

    const result = await useCase.execute({ appointmentId: 'appt-1', actor: inspActor });

    expect(result.id).toBe('appt-1');
    expect(result.status).toBe('SCHEDULED');
    expect(result.scheduledDate).toBe('2026-03-21');
    expect(result.timeSlotStart).toBe('09:00');
    expect(result.timeSlotEnd).toBe('11:00');
    expect(result.meetingLocation).toBe('Front door');
    expect(result.keyLocation).toBe('Lockbox #3');

    expect(result.contact).not.toBeNull();
    expect(result.contact!.rentalTenantName).toBe('John Smith');
    expect(result.contact!.primaryEmail).toBe('john@example.com');
    expect(result.contact!.primaryPhone).toBe('+61400000000');

    expect(result.restrictions).toHaveLength(1);
    expect(result.restrictions[0].isHome).toBe(true);
    expect(result.restrictions[0].notes).toBe('Dog in backyard');

    expect(result.execution).not.toBeNull();
    expect(result.execution!.id).toBe('exec-1');
    expect(result.execution!.status).toBe('IN_PROGRESS');
    expect(result.execution!.startLatitude).toBe(-33.8688);
  });

  it('should return detail without execution when inspection not started', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, true, false),
    );
    vi.mocked(executionRepo.findByAppointmentId).mockResolvedValue(null);

    const result = await useCase.execute({ appointmentId: 'appt-1', actor: inspActor });

    expect(result.execution).toBeNull();
  });

  it('should throw ExecutionAppointmentNotFoundError when appointment not found', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ appointmentId: 'nonexistent', actor: inspActor }),
    ).rejects.toThrow(ExecutionAppointmentNotFoundError);
  });

  it('should throw ExecutionAppointmentNotFoundError when inspector does not match', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ inspectorId: 'other-inspector' }),
    );

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: inspActor }),
    ).rejects.toThrow(ExecutionAppointmentNotFoundError);
  });

  it('should throw ExecutionAppointmentNotFoundError when status is not SCHEDULED or DONE', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT' }),
    );

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: inspActor }),
    ).rejects.toThrow(ExecutionAppointmentNotFoundError);
  });

  it('should throw ForbiddenError when actor is not INSP', async () => {
    const amActor: AuthContext = { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: amActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ExecutionT1BlockedError for unconfirmed ROUTINE at T-1', async () => {
    const today = new Date('2026-03-20T12:00:00Z');
    vi.useFakeTimers({ now: today });

    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({
        scheduledDate: new Date('2026-03-21T12:00:00Z'),
        rentalTenantConfirmationStatus: 'PENDING',
        keyRequired: false,
      }),
    );
    vi.mocked(serviceTypeReader.findById).mockResolvedValue({
      id: 'st-1',
      code: 'ROUTINE',
      name: 'Routine Inspection',
      flowType: 'ROUTINE',
    });

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: inspActor }),
    ).rejects.toThrow(ExecutionT1BlockedError);

    vi.useRealTimers();
  });

  it('should throw ExecutionT1BlockedError for unconfirmed ROUTINE on the scheduled day', async () => {
    const today = new Date('2026-03-21T12:00:00Z');
    vi.useFakeTimers({ now: today });

    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({
        scheduledDate: new Date('2026-03-21T12:00:00Z'),
        rentalTenantConfirmationStatus: 'PENDING',
        keyRequired: false,
      }),
    );

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: inspActor }),
    ).rejects.toThrow(ExecutionT1BlockedError);

    vi.useRealTimers();
  });

  it('should throw ExecutionT1BlockedError for ROUTINE marked UNAVAILABLE on the scheduled day', async () => {
    const today = new Date('2026-03-21T12:00:00Z');
    vi.useFakeTimers({ now: today });

    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({
        scheduledDate: new Date('2026-03-21T12:00:00Z'),
        rentalTenantConfirmationStatus: 'UNAVAILABLE',
        keyRequired: false,
      }),
    );

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: inspActor }),
    ).rejects.toThrow(ExecutionT1BlockedError);

    vi.useRealTimers();
  });

  it('should allow DONE appointment detail without T-1 check', async () => {
    const today = new Date('2026-03-20T12:00:00Z');
    vi.useFakeTimers({ now: today });

    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({
        status: 'DONE',
        scheduledDate: new Date('2026-03-21T12:00:00Z'),
        rentalTenantConfirmationStatus: 'PENDING',
        keyRequired: false,
      }),
    );
    vi.mocked(executionRepo.findByAppointmentId).mockResolvedValue(
      makeExecution({ finishedAt: new Date('2026-03-21T11:00:00Z') }),
    );

    const result = await useCase.execute({ appointmentId: 'appt-1', actor: inspActor });

    expect(result.status).toBe('DONE');
    expect(result.execution).not.toBeNull();
    expect(result.execution!.status).toBe('FINISHED');
    expect(serviceTypeReader.findById).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should return null contact when no contact exists', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, false, false),
    );

    const result = await useCase.execute({ appointmentId: 'appt-1', actor: inspActor });

    expect(result.contact).toBeNull();
    expect(result.restrictions).toHaveLength(0);
  });

  describe('jobDetails.tenantContacts registry enrichment (021 contacts)', () => {
    const registryRow = (overrides: Partial<ContactRegistryInfo> = {}): ContactRegistryInfo => ({
      id: 'reg-1',
      type: 'INDIVIDUAL',
      company: 'Acme Corp',
      additionalChannels: [
        { channel: 'PHONE', value: '+61411111111', label: 'Work' },
        { channel: 'EMAIL', value: 'alt@example.com' },
      ],
      ...overrides,
    });

    function makeUseCaseWithReader(reader: IContactReader): GetAppointmentDetailUseCase {
      const authorizationService = new AuthorizationService({ log: vi.fn() } as never);
      return new GetAppointmentDetailUseCase(
        appointmentRepo,
        executionRepo,
        serviceTypeReader,
        authorizationService,
        tenantRepo,
        undefined,
        reader,
      );
    }

    it('enriches linked contacts with type, company and additionalChannels from the registry', async () => {
      const linked = makeContact({ contactId: 'reg-1' });
      vi.mocked(appointmentRepo.findById).mockResolvedValue({
        appointment: makeAppointmentEntity(),
        contact: linked,
        contacts: [linked],
        restrictions: [],
      });
      const reader: IContactReader = { findByIds: vi.fn().mockResolvedValue([registryRow()]) };

      const result = await makeUseCaseWithReader(reader).execute({ appointmentId: 'appt-1', actor: inspActor });

      expect(reader.findByIds).toHaveBeenCalledTimes(1);
      expect(reader.findByIds).toHaveBeenCalledWith(['reg-1']);
      const entry = result.jobDetails!.tenantContacts[0];
      expect(entry.name).toBe('John Smith'); // snapshot stays authoritative
      expect(entry.type).toBe('INDIVIDUAL');
      expect(entry.company).toBe('Acme Corp');
      expect(entry.additionalChannels).toEqual([
        { channel: 'PHONE', value: '+61411111111', label: 'Work' },
        { channel: 'EMAIL', value: 'alt@example.com' },
      ]);
    });

    it('returns null/empty enrichment for inline contacts (no contactId) without calling the reader', async () => {
      const inline = makeContact({ contactId: null });
      vi.mocked(appointmentRepo.findById).mockResolvedValue({
        appointment: makeAppointmentEntity(),
        contact: inline,
        contacts: [inline],
        restrictions: [],
      });
      const reader: IContactReader = { findByIds: vi.fn().mockResolvedValue([]) };

      const result = await makeUseCaseWithReader(reader).execute({ appointmentId: 'appt-1', actor: inspActor });

      expect(reader.findByIds).not.toHaveBeenCalled();
      const entry = result.jobDetails!.tenantContacts[0];
      expect(entry.type).toBeNull();
      expect(entry.company).toBeNull();
      expect(entry.additionalChannels).toEqual([]);
    });

    it('returns null/empty enrichment when the registry row is missing', async () => {
      const linked = makeContact({ contactId: 'reg-gone' });
      vi.mocked(appointmentRepo.findById).mockResolvedValue({
        appointment: makeAppointmentEntity(),
        contact: linked,
        contacts: [linked],
        restrictions: [],
      });
      const reader: IContactReader = { findByIds: vi.fn().mockResolvedValue([]) };

      const result = await makeUseCaseWithReader(reader).execute({ appointmentId: 'appt-1', actor: inspActor });

      const entry = result.jobDetails!.tenantContacts[0];
      expect(entry.type).toBeNull();
      expect(entry.company).toBeNull();
      expect(entry.additionalChannels).toEqual([]);
    });

    it('populates propertyManager.company from the registry and keeps BROKER excluded', async () => {
      const primary = makeContact({ contactId: 'reg-1' });
      const pm = makeContact({
        id: 'contact-2', contactId: 'reg-pm', role: 'PROPERTY_MANAGER', isPrimary: false,
        snapshotName: 'Paula PM', snapshotEmail: 'pm@x.com', snapshotPhone: null,
      });
      const broker = makeContact({
        id: 'contact-3', contactId: 'reg-br', role: 'BROKER', isPrimary: false, snapshotName: 'Bob Broker',
      });
      vi.mocked(appointmentRepo.findById).mockResolvedValue({
        appointment: makeAppointmentEntity(),
        contact: primary,
        contacts: [primary, pm, broker],
        restrictions: [],
      });
      const reader: IContactReader = {
        findByIds: vi.fn().mockResolvedValue([
          registryRow(),
          registryRow({ id: 'reg-pm', type: 'COMPANY', company: 'PM Group', additionalChannels: [] }),
        ]),
      };

      const result = await makeUseCaseWithReader(reader).execute({ appointmentId: 'appt-1', actor: inspActor });

      expect(reader.findByIds).toHaveBeenCalledWith(['reg-1', 'reg-pm']);
      expect(result.jobDetails!.tenantContacts).toHaveLength(1);
      expect(result.jobDetails!.tenantContacts.some((c) => c.name === 'Bob Broker')).toBe(false);
      expect(result.jobDetails!.propertyManager).toEqual({
        name: 'Paula PM', email: 'pm@x.com', phone: null, company: 'PM Group',
      });
    });

    it('keeps legacy output shape when no contact reader is injected', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

      const result = await useCase.execute({ appointmentId: 'appt-1', actor: inspActor });

      const entry = result.jobDetails!.tenantContacts[0];
      expect(entry.type).toBeUndefined();
      expect(entry.company).toBeUndefined();
      expect(entry.additionalChannels).toBeUndefined();
    });
  });

  describe('customFields (read-only for inspector)', () => {
    it('returns the appointment custom fields', async () => {
      const customFields = [
        { label: 'Gate code', value: '1234' },
        { label: 'Parking', value: 'Level 2' },
      ];
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ customFieldsJson: customFields }),
      );

      const result = await useCase.execute({ appointmentId: 'appt-1', actor: inspActor });

      expect(result.customFields).toEqual(customFields);
    });

    it('returns an empty array when there are no custom fields', async () => {
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ customFieldsJson: null }),
      );

      const result = await useCase.execute({ appointmentId: 'appt-1', actor: inspActor });

      expect(result.customFields).toEqual([]);
    });

    it('drops malformed rows and caps the list at 4', async () => {
      const stored = [
        { label: 'A', value: '1' },
        { label: '', value: 'x' }, // dropped: empty label
        { label: 'B' }, // dropped: missing value
        { label: 'C', value: '3' },
        { label: 'D', value: '4' },
        { label: 'E', value: '5' },
        { label: 'F', value: '6' },
      ] as unknown as { label: string; value: string }[];
      vi.mocked(appointmentRepo.findById).mockResolvedValue(
        makeAppointmentWithRelations({ customFieldsJson: stored }),
      );

      const result = await useCase.execute({ appointmentId: 'appt-1', actor: inspActor });

      expect(result.customFields).toEqual([
        { label: 'A', value: '1' },
        { label: 'C', value: '3' },
        { label: 'D', value: '4' },
        { label: 'E', value: '5' },
      ]);
    });
  });
});
