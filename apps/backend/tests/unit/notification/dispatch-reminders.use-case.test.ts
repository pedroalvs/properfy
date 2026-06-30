import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DispatchRemindersUseCase } from '../../../src/modules/notification/application/use-cases/dispatch-reminders.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { BuildNotificationPayloadService } from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
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
    scheduledDate: new Date('2026-04-01'),
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'CONFIRMED',
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
    tenantName: 'John Doe',
    primaryEmail: 'john@example.com',
    secondaryEmail: null,
    primaryPhone: null,
    secondaryPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeTenant(tenantId = 'tenant-1') {
  return new TenantEntity({
    id: tenantId,
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    settingsJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
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

describe('DispatchRemindersUseCase', () => {
  let useCase: DispatchRemindersUseCase;
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
  let mockTenantRepo: { findById: ReturnType<typeof vi.fn> };
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
  const buildNotificationPayload = new BuildNotificationPayloadService();
  const appointmentCodeFormatter = new AppointmentCodeFormatter();

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
    mockTenantRepo = {
      findById: vi.fn().mockResolvedValue(makeTenant()),
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
    useCase = new DispatchRemindersUseCase(
      mockAppointmentRepo as unknown as IAppointmentRepository,
      mockTenantRepo as unknown as ITenantRepository,
      mockNotificationRepo as unknown as INotificationRepository,
      buildNotificationPayload,
      appointmentCodeFormatter,
      mockCreateNotification as unknown as CreateNotificationUseCase,
      'http://localhost:5173',
    );
  });

  it('returns { dispatched: 0, skipped: 0 } when no appointments found for any window', async () => {
    const result = await useCase.execute(today);

    expect(result).toEqual({ dispatched: 0, skipped: 0 });
  });

  it('calls findScheduledOnDate exactly 3 times (T+7, T+5, T+3)', async () => {
    await useCase.execute(today);

    expect(mockAppointmentRepo.findScheduledOnDate).toHaveBeenCalledTimes(3);
  });

  it('passes correct UTC target dates to findScheduledOnDate', async () => {
    await useCase.execute(today);

    const calls = mockAppointmentRepo.findScheduledOnDate.mock.calls;
    expect(calls[0][0]).toEqual(new Date('2026-03-24T00:00:00.000Z'));
    expect(calls[1][0]).toEqual(new Date('2026-03-22T00:00:00.000Z'));
    expect(calls[2][0]).toEqual(new Date('2026-03-20T00:00:00.000Z'));
  });

  it('skips appointment with no contact (increments skipped)', async () => {
    mockAppointmentRepo.findScheduledOnDate
      .mockResolvedValueOnce([makeRelation({}, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await useCase.execute(today);

    expect(result).toEqual({ dispatched: 0, skipped: 1 });
    expect(mockCreateNotification.execute).not.toHaveBeenCalled();
  });

  it('skips appointment where existsByAppointmentAndTemplate returns true (increments skipped)', async () => {
    mockAppointmentRepo.findScheduledOnDate
      .mockResolvedValueOnce([makeRelation()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockNotificationRepo.existsByAppointmentAndTemplate.mockResolvedValueOnce(true);

    const result = await useCase.execute(today);

    expect(result).toEqual({ dispatched: 0, skipped: 1 });
    expect(mockCreateNotification.execute).not.toHaveBeenCalled();
  });

  it('calls createNotification with REMINDER_7_DAYS for T+7 appointment', async () => {
    mockAppointmentRepo.findScheduledOnDate
      .mockResolvedValueOnce([makeRelation()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await useCase.execute(today);

    expect(mockCreateNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'REMINDER_7_DAYS' }),
    );
  });

  it('calls createNotification with REMINDER_5_DAYS for T+5 appointment', async () => {
    mockAppointmentRepo.findScheduledOnDate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRelation()])
      .mockResolvedValueOnce([]);

    await useCase.execute(today);

    expect(mockCreateNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'REMINDER_5_DAYS' }),
    );
  });

  it('calls createNotification with REMINDER_3_DAYS for T+3 appointment', async () => {
    mockAppointmentRepo.findScheduledOnDate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRelation()]);

    await useCase.execute(today);

    expect(mockCreateNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'REMINDER_3_DAYS' }),
    );
  });

  it('passes correct payloadJson fields', async () => {
    const scheduledDate = new Date('2026-03-24T00:00:00.000Z');
    mockAppointmentRepo.findScheduledOnDate
      .mockResolvedValueOnce([
        makeRelation(
          { id: 'appt-x', tenantId: 'tenant-x', scheduledDate, timeSlotStart: '14:00', timeSlotEnd: '17:00' },
          { tenantName: 'Jane Smith', primaryEmail: 'jane@example.com' },
        ),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockTenantRepo.findById.mockResolvedValue(makeTenant('tenant-x'));

    await useCase.execute(today);

    expect(mockCreateNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-x',
        appointmentId: 'appt-x',
        recipient: 'jane@example.com',
        channel: 'EMAIL',
        templateCode: 'REMINDER_7_DAYS',
        payloadJson: expect.objectContaining({
          tenantName: 'Jane Smith',
          scheduledDate: '2026-03-24',
        }),
      }),
    );
  });

  it('correctly counts multiple dispatches across multiple appointments and windows', async () => {
    const relation1 = makeRelation({ id: 'appt-1' });
    const relation2 = makeRelation({ id: 'appt-2' });
    const relation3 = makeRelation({ id: 'appt-3' });
    mockAppointmentRepo.findScheduledOnDate
      .mockResolvedValueOnce([relation1, relation2])
      .mockResolvedValueOnce([relation3])
      .mockResolvedValueOnce([]);

    const result = await useCase.execute(today);

    expect(result).toEqual({ dispatched: 3, skipped: 0 });
    expect(mockCreateNotification.execute).toHaveBeenCalledTimes(3);
  });

  it('propagates error from createNotification (does NOT swallow)', async () => {
    mockAppointmentRepo.findScheduledOnDate
      .mockResolvedValueOnce([makeRelation()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockCreateNotification.execute.mockRejectedValueOnce(new Error('DB write failed'));

    await expect(useCase.execute(today)).rejects.toThrow('DB write failed');
  });

  // GAP-010: SMS fallback when email missing
  describe('GAP-010: SMS fallback when email missing', () => {
    it('creates SMS notification when no email but phone is present', async () => {
      mockAppointmentRepo.findScheduledOnDate
        .mockResolvedValueOnce([
          makeRelation(
            { id: 'appt-sms', tenantId: 'tenant-sms' },
            { primaryEmail: null, primaryPhone: '+61400000000', tenantName: 'SMS Tenant' },
          ),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockTenantRepo.findById.mockResolvedValue(makeTenant('tenant-sms'));

      const result = await useCase.execute(today);

      expect(result).toEqual({ dispatched: 1, skipped: 0 });
      expect(mockCreateNotification.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'SMS',
          recipient: '+61400000000',
          templateCode: 'REMINDER_7_DAYS_SMS',
        }),
      );
    });

    it('skips appointment when no email and no phone', async () => {
      mockAppointmentRepo.findScheduledOnDate
        .mockResolvedValueOnce([
          makeRelation(
            { id: 'appt-skip' },
            { primaryEmail: null, primaryPhone: null },
          ),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await useCase.execute(today);

      expect(result).toEqual({ dispatched: 0, skipped: 1 });
      expect(mockCreateNotification.execute).not.toHaveBeenCalled();
    });

    it('uses EMAIL when email is present (no SMS fallback needed)', async () => {
      mockAppointmentRepo.findScheduledOnDate
        .mockResolvedValueOnce([
          makeRelation(
            { id: 'appt-email' },
            { primaryEmail: 'test@example.com', primaryPhone: '+61400000000' },
          ),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await useCase.execute(today);

      expect(result).toEqual({ dispatched: 1, skipped: 0 });
      expect(mockCreateNotification.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'EMAIL',
          recipient: 'test@example.com',
          templateCode: 'REMINDER_7_DAYS',
        }),
      );
    });

    it('uses correct SMS template code for each reminder window', async () => {
      // T+5 appointment with phone only
      mockAppointmentRepo.findScheduledOnDate
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makeRelation(
            { id: 'appt-5d' },
            { primaryEmail: null, primaryPhone: '+61400000000' },
          ),
        ])
        .mockResolvedValueOnce([
          makeRelation(
            { id: 'appt-3d' },
            { primaryEmail: null, primaryPhone: '+61400000001' },
          ),
        ]);

      const result = await useCase.execute(today);

      expect(result).toEqual({ dispatched: 2, skipped: 0 });
      expect(mockCreateNotification.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          templateCode: 'REMINDER_5_DAYS_SMS',
          channel: 'SMS',
        }),
      );
      expect(mockCreateNotification.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          templateCode: 'REMINDER_3_DAYS_SMS',
          channel: 'SMS',
        }),
      );
    });

    it('checks dedup with SMS template code for phone-only contacts', async () => {
      mockAppointmentRepo.findScheduledOnDate
        .mockResolvedValueOnce([
          makeRelation(
            { id: 'appt-dup' },
            { primaryEmail: null, primaryPhone: '+61400000000' },
          ),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockNotificationRepo.existsByAppointmentAndTemplate.mockResolvedValueOnce(true);

      const result = await useCase.execute(today);

      expect(result).toEqual({ dispatched: 0, skipped: 1 });
      expect(mockNotificationRepo.existsByAppointmentAndTemplate).toHaveBeenCalledWith(
        'appt-dup',
        'REMINDER_7_DAYS_SMS',
      );
    });

    it('skips when contact is null (no contact at all)', async () => {
      mockAppointmentRepo.findScheduledOnDate
        .mockResolvedValueOnce([makeRelation({}, null)])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await useCase.execute(today);

      expect(result).toEqual({ dispatched: 0, skipped: 1 });
    });
  });
});
