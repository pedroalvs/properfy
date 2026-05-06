import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmAppointmentUseCase } from '../../../src/modules/tenant-portal/application/use-cases/confirm-appointment.use-case';
import type { ITenantPortalActivityRepository } from '../../../src/modules/tenant-portal/domain/tenant-portal-activity.repository';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import {
  PortalActionBlockedError,
  PortalAppointmentInactiveError,
} from '../../../src/modules/tenant-portal/domain/tenant-portal.errors';

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
): AppointmentWithRelations {
  return {
    appointment: makeAppointmentEntity(appointmentOverrides),
    contact: makeContact(),
    restrictions: [],
  };
}

function makeInput(overrides: Partial<Parameters<ConfirmAppointmentUseCase['execute']>[0]> = {}) {
  return {
    tokenId: 'token-1',
    appointmentId: 'appt-1',
    isReadOnly: false,
    isUsed: false,
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    ...overrides,
  };
}

describe('ConfirmAppointmentUseCase', () => {
  let activityRepo: ITenantPortalActivityRepository;
  let appointmentRepo: IAppointmentRepository;
  let auditService: PersistentAuditService;
  let useCase: ConfirmAppointmentUseCase;

  beforeEach(() => {
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
    auditService = {
      log: vi.fn(),
    } as unknown as PersistentAuditService;
    useCase = new ConfirmAppointmentUseCase(activityRepo, appointmentRepo, auditService);
  });

  it('should confirm appointment and return CONFIRMED status', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    const result = await useCase.execute(makeInput());

    expect(result.tenantConfirmationStatus).toBe('CONFIRMED');
    expect(result.confirmedAt).toBeDefined();
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      tenantConfirmationStatus: 'CONFIRMED',
    });
    expect(appointmentRepo.deleteRestrictionsByAppointmentId).toHaveBeenCalledWith('appt-1');
  });

  it('should throw PortalActionBlockedError when token is read-only', async () => {
    await expect(
      useCase.execute(makeInput({ isReadOnly: true })),
    ).rejects.toThrow(PortalActionBlockedError);

    expect(appointmentRepo.findById).not.toHaveBeenCalled();
  });

  it('should return idempotent success when already confirmed', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ tenantConfirmationStatus: 'CONFIRMED' }),
    );

    const result = await useCase.execute(makeInput());

    expect(result.tenantConfirmationStatus).toBe('CONFIRMED');
    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should throw PortalAppointmentInactiveError for CANCELLED appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'CANCELLED' }),
    );

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should throw PortalAppointmentInactiveError for DONE appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DONE' }),
    );

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should throw PortalAppointmentInactiveError for REJECTED appointment', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'REJECTED' }),
    );

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should throw PortalAppointmentInactiveError when appointment not found', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should record CONFIRM activity with previous and new values', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute(makeInput());

    expect(activityRepo.save).toHaveBeenCalledOnce();
    const savedActivity = vi.mocked(activityRepo.save).mock.calls[0][0];
    expect(savedActivity.action).toBe('CONFIRM');
    expect(savedActivity.appointmentId).toBe('appt-1');
    expect(savedActivity.tenantPortalTokenId).toBe('token-1');
    expect(savedActivity.previousValuesJson).toEqual({ tenantConfirmationStatus: 'PENDING' });
    expect(savedActivity.newValuesJson).toEqual({ tenantConfirmationStatus: 'CONFIRMED' });
    expect(savedActivity.ipAddress).toBe('192.168.1.1');
    expect(savedActivity.userAgent).toBe('Mozilla/5.0');
  });

  it('should log audit entry on confirmation', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute(makeInput());

    expect(auditService.log).toHaveBeenCalledWith({
      action: 'tenant_portal.appointment_confirmed',
      actorType: 'ANONYMOUS',
      entityType: 'Appointment',
      entityId: 'appt-1',
      tenantId: 'tenant-1',
      before: { tenantConfirmationStatus: 'PENDING' },
      after: { tenantConfirmationStatus: 'CONFIRMED' },
      ipAddress: '192.168.1.1',
    });
  });

  it('should save restrictions when provided', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    const restrictions = {
      isHome: true,
      unavailableDaysJson: ['Monday', 'Tuesday'],
      unavailableHoursJson: ['08:00-09:00'],
      notes: 'Dog at home',
    };

    await useCase.execute(makeInput({ restrictions }));

    expect(appointmentRepo.deleteRestrictionsByAppointmentId).toHaveBeenCalledWith('appt-1');
    expect(appointmentRepo.saveRestriction).toHaveBeenCalledOnce();
    const savedRestriction = vi.mocked(appointmentRepo.saveRestriction).mock.calls[0][0];
    expect(savedRestriction.appointmentId).toBe('appt-1');
    expect(savedRestriction.isHome).toBe(true);
    expect(savedRestriction.unavailableDaysJson).toEqual(['Monday', 'Tuesday']);
    expect(savedRestriction.unavailableHoursJson).toEqual(['08:00-09:00']);
    expect(savedRestriction.notes).toBe('Dog at home');
    expect(savedRestriction.source).toBe('TENANT_PORTAL');
  });

  it('should clear stale restrictions even when no new restrictions are provided', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute(makeInput());

    expect(appointmentRepo.deleteRestrictionsByAppointmentId).toHaveBeenCalledWith('appt-1');
    expect(appointmentRepo.saveRestriction).not.toHaveBeenCalled();
  });

  it('should allow confirmation for DRAFT status', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT' }),
    );

    const result = await useCase.execute(makeInput());

    expect(result.tenantConfirmationStatus).toBe('CONFIRMED');
  });

  it('should allow confirmation for SCHEDULED status', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'SCHEDULED' }),
    );

    const result = await useCase.execute(makeInput());

    expect(result.tenantConfirmationStatus).toBe('CONFIRMED');
  });
});

describe('ConfirmAppointmentUseCase – onNotificationHandler', () => {
  let activityRepo: ITenantPortalActivityRepository;
  let appointmentRepo: IAppointmentRepository;
  let auditService: PersistentAuditService;
  let onNotificationHandler: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
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
    auditService = {
      log: vi.fn(),
    } as unknown as PersistentAuditService;
    onNotificationHandler = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('calls onNotificationHandler with CONFIRM action after confirmation', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    const useCase = new ConfirmAppointmentUseCase(
      activityRepo, appointmentRepo, auditService, onNotificationHandler,
    );
    await useCase.execute(makeInput());

    expect(onNotificationHandler.execute).toHaveBeenCalledOnce();
    expect(onNotificationHandler.execute).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      tenantId: 'tenant-1',
      action: 'CONFIRM',
    });
  });

  it('confirmation succeeds if onNotificationHandler throws', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    onNotificationHandler.execute.mockRejectedValueOnce(new Error('Notification failure'));

    const useCase = new ConfirmAppointmentUseCase(
      activityRepo, appointmentRepo, auditService, onNotificationHandler,
    );
    const result = await useCase.execute(makeInput());

    expect(result.tenantConfirmationStatus).toBe('CONFIRMED');
  });

  it('does not call onNotificationHandler when not provided', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    const useCase = new ConfirmAppointmentUseCase(
      activityRepo, appointmentRepo, auditService,
    );
    await useCase.execute(makeInput());

    expect(onNotificationHandler.execute).not.toHaveBeenCalled();
  });
});
