import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DispatchEscalationsUseCase } from '../../../src/modules/notification/application/use-cases/dispatch-escalations.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { INotificationRepository } from '../../../src/modules/notification/domain/notification.repository';
import type { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';

function makeAppointment(
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
    scheduledDate: new Date('2026-03-19'),
    timeSlot: '09:00-12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
    priceAmount: 200,
    payoutAmount: 140,
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

function makeContact(
  overrides: Partial<ConstructorParameters<typeof AppointmentContactEntity>[0]> = {},
): AppointmentContactEntity {
  return new AppointmentContactEntity({
    id: 'contact-1',
    appointmentId: 'appt-1',
    tenantName: 'John Doe',
    primaryEmail: 'john@example.com',
    secondaryEmail: null,
    primaryPhone: '+61400000000',
    secondaryPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeBranch(
  overrides: Partial<ConstructorParameters<typeof BranchEntity>[0]> = {},
): BranchEntity {
  return new BranchEntity({
    id: 'branch-1',
    tenantId: 'tenant-1',
    name: 'Main Branch',
    addressJson: null,
    contactEmail: 'pm@agency.com',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeRelation(
  appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
  contactOverrides: Partial<ConstructorParameters<typeof AppointmentContactEntity>[0]> | null = {},
): AppointmentWithRelations {
  const appointment = makeAppointment(appointmentOverrides);
  const contact = contactOverrides === null ? null : makeContact(contactOverrides);
  return { appointment, contact, restrictions: [] };
}

describe('DispatchEscalationsUseCase', () => {
  let useCase: DispatchEscalationsUseCase;
  let mockAppointmentRepo: {
    findById: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    saveContact: ReturnType<typeof vi.fn>;
    updateContact: ReturnType<typeof vi.fn>;
    saveRestriction: ReturnType<typeof vi.fn>;
    deleteRestrictionsByAppointmentId: ReturnType<typeof vi.fn>;
    findScheduledOnDate: ReturnType<typeof vi.fn>;
  };
  let mockBranchRepo: {
    findById: ReturnType<typeof vi.fn>;
    findByName: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockNotificationRepo: {
    findById: ReturnType<typeof vi.fn>;
    findByProviderMessageId: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findRetryable: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    existsByAppointmentAndTemplate: ReturnType<typeof vi.fn>;
  };
  let mockCreateNotification: { execute: ReturnType<typeof vi.fn> };

  const today = new Date('2026-03-17T10:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    mockAppointmentRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
      findScheduledOnDate: vi.fn().mockResolvedValue([]),
    };
    mockBranchRepo = {
      findById: vi.fn().mockResolvedValue(makeBranch()),
      findByName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    mockNotificationRepo = {
      findById: vi.fn(),
      findByProviderMessageId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      findRetryable: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      existsByAppointmentAndTemplate: vi.fn().mockResolvedValue(false),
    };
    mockCreateNotification = {
      execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
    };
    useCase = new DispatchEscalationsUseCase(
      mockAppointmentRepo as unknown as IAppointmentRepository,
      mockBranchRepo as unknown as IBranchRepository,
      mockNotificationRepo as unknown as INotificationRepository,
      mockCreateNotification as unknown as CreateNotificationUseCase,
    );
  });

  it('returns zeros when no appointments found', async () => {
    const result = await useCase.execute(today);

    expect(result).toEqual({ pmEscalations: 0, smsAlerts: 0, skipped: 0 });
  });

  it('calls findScheduledOnDate with correct T+2 date', async () => {
    await useCase.execute(today);

    expect(mockAppointmentRepo.findScheduledOnDate).toHaveBeenCalledWith(
      new Date('2026-03-19T00:00:00.000Z'),
    );
  });

  it('skips confirmed appointments', async () => {
    mockAppointmentRepo.findScheduledOnDate.mockResolvedValueOnce([
      makeRelation({ tenantConfirmationStatus: 'CONFIRMED' }),
    ]);

    const result = await useCase.execute(today);

    expect(result).toEqual({ pmEscalations: 0, smsAlerts: 0, skipped: 1 });
    expect(mockCreateNotification.execute).not.toHaveBeenCalled();
  });

  it('sends PM escalation email when branch has contactEmail', async () => {
    mockAppointmentRepo.findScheduledOnDate.mockResolvedValueOnce([makeRelation()]);

    const result = await useCase.execute(today);

    expect(mockCreateNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'EMAIL',
        templateCode: 'PROPERTY_MANAGER_ESCALATION',
        recipient: 'pm@agency.com',
      }),
    );
    expect(result.pmEscalations).toBe(1);
  });

  it('sends tenant SMS when contact has primaryPhone', async () => {
    mockAppointmentRepo.findScheduledOnDate.mockResolvedValueOnce([makeRelation()]);

    const result = await useCase.execute(today);

    expect(mockCreateNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'SMS',
        templateCode: 'TENANT_SMS_ALERT',
        recipient: '+61400000000',
      }),
    );
    expect(result.smsAlerts).toBe(1);
  });

  it('sends both PM and SMS for same appointment', async () => {
    mockAppointmentRepo.findScheduledOnDate.mockResolvedValueOnce([makeRelation()]);

    const result = await useCase.execute(today);

    expect(result).toEqual({ pmEscalations: 1, smsAlerts: 1, skipped: 0 });
    expect(mockCreateNotification.execute).toHaveBeenCalledTimes(2);
  });

  it('skips PM escalation when branch has no contactEmail (increments skipped)', async () => {
    mockBranchRepo.findById.mockResolvedValueOnce(makeBranch({ contactEmail: null }));
    mockAppointmentRepo.findScheduledOnDate.mockResolvedValueOnce([makeRelation()]);

    const result = await useCase.execute(today);

    expect(result.pmEscalations).toBe(0);
    expect(result.smsAlerts).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('skips SMS when contact has no primaryPhone (increments skipped)', async () => {
    mockAppointmentRepo.findScheduledOnDate.mockResolvedValueOnce([
      makeRelation({}, { primaryPhone: null }),
    ]);

    const result = await useCase.execute(today);

    expect(result.pmEscalations).toBe(1);
    expect(result.smsAlerts).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips SMS when no contact at all (increments skipped)', async () => {
    mockAppointmentRepo.findScheduledOnDate.mockResolvedValueOnce([makeRelation({}, null)]);

    const result = await useCase.execute(today);

    expect(result.smsAlerts).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('deduplicates PM escalation via existsByAppointmentAndTemplate', async () => {
    mockAppointmentRepo.findScheduledOnDate.mockResolvedValueOnce([makeRelation()]);
    mockNotificationRepo.existsByAppointmentAndTemplate
      .mockResolvedValueOnce(true)   // PM already sent
      .mockResolvedValueOnce(false); // SMS not sent

    const result = await useCase.execute(today);

    expect(result.pmEscalations).toBe(0);
    expect(result.smsAlerts).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('deduplicates SMS via existsByAppointmentAndTemplate', async () => {
    mockAppointmentRepo.findScheduledOnDate.mockResolvedValueOnce([makeRelation()]);
    mockNotificationRepo.existsByAppointmentAndTemplate
      .mockResolvedValueOnce(false) // PM not sent
      .mockResolvedValueOnce(true); // SMS already sent

    const result = await useCase.execute(today);

    expect(result.pmEscalations).toBe(1);
    expect(result.smsAlerts).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('passes correct payloadJson for PM escalation (includes branchName)', async () => {
    const scheduledDate = new Date('2026-03-19T00:00:00.000Z');
    mockAppointmentRepo.findScheduledOnDate.mockResolvedValueOnce([
      makeRelation(
        { id: 'appt-x', tenantId: 'tenant-x', branchId: 'branch-1', scheduledDate, timeSlot: '14:00-17:00' },
        { tenantName: 'Jane Smith', primaryPhone: '+61400111222' },
      ),
    ]);

    await useCase.execute(today);

    expect(mockCreateNotification.execute).toHaveBeenCalledWith({
      tenantId: 'tenant-x',
      appointmentId: 'appt-x',
      recipient: 'pm@agency.com',
      channel: 'EMAIL',
      templateCode: 'PROPERTY_MANAGER_ESCALATION',
      payloadJson: {
        tenantName: 'Jane Smith',
        scheduledDate: '2026-03-19',
        timeSlot: '14:00-17:00',
        appointmentReference: 'appt-x',
        branchName: 'Main Branch',
      },
    });
  });

  it('passes correct payloadJson for SMS (shorter payload)', async () => {
    const scheduledDate = new Date('2026-03-19T00:00:00.000Z');
    mockAppointmentRepo.findScheduledOnDate.mockResolvedValueOnce([
      makeRelation(
        { id: 'appt-x', tenantId: 'tenant-x', scheduledDate, timeSlot: '14:00-17:00' },
        { tenantName: 'Jane Smith', primaryPhone: '+61400111222' },
      ),
    ]);

    await useCase.execute(today);

    expect(mockCreateNotification.execute).toHaveBeenCalledWith({
      tenantId: 'tenant-x',
      appointmentId: 'appt-x',
      recipient: '+61400111222',
      channel: 'SMS',
      templateCode: 'TENANT_SMS_ALERT',
      payloadJson: {
        tenantName: 'Jane Smith',
        scheduledDate: '2026-03-19',
        timeSlot: '14:00-17:00',
      },
    });
  });

  it('propagates error from createNotification (does NOT swallow)', async () => {
    mockAppointmentRepo.findScheduledOnDate.mockResolvedValueOnce([makeRelation()]);
    mockCreateNotification.execute.mockRejectedValueOnce(new Error('DB write failed'));

    await expect(useCase.execute(today)).rejects.toThrow('DB write failed');
  });
});
