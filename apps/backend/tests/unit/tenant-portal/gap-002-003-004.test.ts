import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { ConfirmAppointmentUseCase } from '../../../src/modules/tenant-portal/application/use-cases/confirm-appointment.use-case';
import { RescheduleRequestUseCase, type RescheduleRequestInput } from '../../../src/modules/tenant-portal/application/use-cases/reschedule-request.use-case';
import { ReportUnavailabilityUseCase, type ReportUnavailabilityInput } from '../../../src/modules/tenant-portal/application/use-cases/report-unavailability.use-case';
import { UpdateContactUseCase } from '../../../src/modules/tenant-portal/application/use-cases/update-contact.use-case';
import type { ITenantPortalActivityRepository } from '../../../src/modules/tenant-portal/domain/tenant-portal-activity.repository';
import type { ITenantPortalTokenRepository } from '../../../src/modules/tenant-portal/domain/tenant-portal-token.repository';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { IInspectionExecutionRepository } from '../../../src/modules/inspector-execution/domain/inspection-execution.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import type { ReopenForRescheduleUseCase } from '../../../src/modules/appointment/application/use-cases/reopen-for-reschedule.use-case';
import { DomainEventBus, TENANT_PORTAL_EVENTS } from '../../../src/shared/application/events/domain-event-bus';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import {
  PortalTokenAlreadyUsedError,
} from '../../../src/modules/tenant-portal/domain/tenant-portal.errors';

// Freeze "now" at 2026-04-10 so the mock scheduledDate (2026-04-15) stays in
// the future and the 30-day reschedule window guard never trips on CI date
// drift. Tests that submit `Date.now() + 7 days` land at 2026-04-17, well
// inside the window from 2026-04-15.
beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

function makeAppointment(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'stype-1',
    inspectorId: null,
    status: 'AWAITING_INSPECTOR',
    scheduledDate: new Date('2026-04-15'),
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
    priceAmount: 100,
    payoutAmount: 70,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
    deletedAt: null,
    ...overrides,
  });
}

function makeContact() {
  return new AppointmentContactEntity({
    id: 'contact-1',
    appointmentId: 'appt-1',
    contactId: null,
    role: 'TENANT',
    isPrimary: true,
    snapshotName: 'John Smith',
    snapshotEmail: 'john@example.com',
    snapshotPhone: '+61400000000',
    tenantName: 'John Smith',
    primaryEmail: 'john@example.com',
    secondaryEmail: null,
    primaryPhone: '+61400000000',
    secondaryPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeServiceType() {
  return new ServiceTypeEntity({
    id: 'stype-1',
    code: 'ROUTINE',
    name: 'Routine Inspection',
    flowType: 'ROUTINE',
    requiresTenantConfirmation: true,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  });
}

function makeTenant() {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    settingsJson: {},
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  });
}

function makeActivityRepo() {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findLatestByTokenAndAction: vi.fn().mockResolvedValue(null),
  };
}

function makeAppointmentRepo(appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  const contact = makeContact();
  return {
    findById: vi.fn().mockResolvedValue({
      appointment: makeAppointment(appointmentOverrides),
      contact,
      contacts: [contact],
      restrictions: [],
    }),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    saveContact: vi.fn(),
    updateContact: vi.fn().mockResolvedValue(undefined),
    updateContactSnapshot: vi.fn().mockResolvedValue(undefined),
    deleteContactsByAppointmentId: vi.fn().mockResolvedValue(undefined),
    saveRestriction: vi.fn().mockResolvedValue(undefined),
    deleteRestrictionsByAppointmentId: vi.fn().mockResolvedValue(undefined),
  };
}

function makeTokenRepo() {
  return {
    findByTokenHash: vi.fn(),
    findActiveByAppointmentId: vi.fn(),
    save: vi.fn(),
    revokeAndSave: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn(),
    updateLastAccessedAt: vi.fn(),
    markUsed: vi.fn().mockResolvedValue(undefined),
    revokeAllForAppointment: vi.fn().mockResolvedValue(undefined),
    expireActiveTokens: vi.fn().mockResolvedValue(0),
  };
}

// =========================================================================
// GAP-002: Domain events for portal actions
// =========================================================================

describe('GAP-002: Domain events for portal actions', () => {
  describe('ConfirmAppointmentUseCase emits CONFIRMED event', () => {
    it('emits tenant_portal.confirmed.v1 after successful confirmation', async () => {
      const eventBus = new DomainEventBus();
      const emitted: unknown[] = [];
      eventBus.subscribe(TENANT_PORTAL_EVENTS.CONFIRMED, (e) => { emitted.push(e); });

      const activityRepo = makeActivityRepo();
      const appointmentRepo = makeAppointmentRepo();
      const auditService = { log: vi.fn() } as unknown as PersistentAuditService;
      const tokenRepo = makeTokenRepo();

      const useCase = new ConfirmAppointmentUseCase(
        activityRepo as unknown as ITenantPortalActivityRepository,
        appointmentRepo as unknown as IAppointmentRepository,
        auditService,
        undefined,
        eventBus,
        tokenRepo as unknown as ITenantPortalTokenRepository,
      );

      await useCase.execute({
        tokenId: 'token-1',
        appointmentId: 'appt-1',
        isReadOnly: false,
        isUsed: false,
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      });

      expect(emitted).toHaveLength(1);
      expect((emitted[0] as any).type).toBe(TENANT_PORTAL_EVENTS.CONFIRMED);
      expect((emitted[0] as any).payload.appointmentId).toBe('appt-1');
      expect((emitted[0] as any).payload.tenantId).toBe('tenant-1');
    });
  });

  describe('UpdateContactUseCase emits CONTACT_UPDATED event', () => {
    it('emits tenant_portal.contact_updated.v1 after successful update', async () => {
      const eventBus = new DomainEventBus();
      const emitted: unknown[] = [];
      eventBus.subscribe(TENANT_PORTAL_EVENTS.CONTACT_UPDATED, (e) => { emitted.push(e); });

      const activityRepo = makeActivityRepo();
      const appointmentRepo = makeAppointmentRepo();
      const auditService = { log: vi.fn() } as unknown as PersistentAuditService;

      const useCase = new UpdateContactUseCase(
        activityRepo as unknown as ITenantPortalActivityRepository,
        appointmentRepo as unknown as IAppointmentRepository,
        auditService,
        eventBus,
      );

      await useCase.execute({
        tokenId: 'token-1',
        appointmentId: 'appt-1',
        isReadOnly: false,
        contact: { primaryEmail: 'new@email.com' },
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      });

      expect(emitted).toHaveLength(1);
      expect((emitted[0] as any).type).toBe(TENANT_PORTAL_EVENTS.CONTACT_UPDATED);
      expect((emitted[0] as any).payload.appointmentId).toBe('appt-1');
      expect((emitted[0] as any).payload.updatedFields).toEqual(['primaryEmail']);
    });
  });

  describe('ReportUnavailabilityUseCase emits UNAVAILABLE event', () => {
    it('emits tenant_portal.unavailable.v1 after successful report', async () => {
      const eventBus = new DomainEventBus();
      const emitted: unknown[] = [];
      eventBus.subscribe(TENANT_PORTAL_EVENTS.UNAVAILABLE, (e) => { emitted.push(e); });

      const activityRepo = makeActivityRepo();
      const appointmentRepo = makeAppointmentRepo();
      const auditService = { log: vi.fn() } as unknown as PersistentAuditService;

      const useCase = new ReportUnavailabilityUseCase(
        activityRepo as unknown as ITenantPortalActivityRepository,
        appointmentRepo as unknown as IAppointmentRepository,
        auditService,
        undefined,
        undefined,
        eventBus,
      );

      await useCase.execute({
        tokenId: 'token-1',
        appointmentId: 'appt-1',
        isReadOnly: false,
        isUsed: false,
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      });

      expect(emitted).toHaveLength(1);
      expect((emitted[0] as any).type).toBe(TENANT_PORTAL_EVENTS.UNAVAILABLE);
      expect((emitted[0] as any).payload.appointmentId).toBe('appt-1');
      expect((emitted[0] as any).payload.tenantId).toBe('tenant-1');
    });
  });

  describe('RescheduleRequestUseCase emits RESCHEDULED event', () => {
    it('emits tenant_portal.rescheduled.v1 after successful reschedule', async () => {
      const eventBus = new DomainEventBus();
      const emitted: unknown[] = [];
      eventBus.subscribe(TENANT_PORTAL_EVENTS.RESCHEDULED, (e) => { emitted.push(e); });

      const activityRepo = makeActivityRepo();
      const tokenRepo = makeTokenRepo();
      const appointmentRepo = makeAppointmentRepo({ status: 'SCHEDULED', inspectorId: 'insp-1' });
      const serviceTypeRepo = { findById: vi.fn().mockResolvedValue(makeServiceType()), findByCode: vi.fn(), findAll: vi.fn(), count: vi.fn(), save: vi.fn(), update: vi.fn() };
      const executionRepo = { findByAppointmentId: vi.fn().mockResolvedValue(null) };
      const tenantRepo = { findById: vi.fn().mockResolvedValue(makeTenant()) };
      const auditService = { log: vi.fn() } as unknown as PersistentAuditService;
      const reopenForReschedule = {
        execute: vi.fn().mockResolvedValue({
          id: 'appt-1', previousStatus: 'SCHEDULED', status: 'DRAFT',
          scheduledDate: '2026-04-20', timeSlotStart: '14:00', timeSlotEnd: '17:00',
          tenantConfirmationStatus: 'PENDING',
        }),
      };

      const useCase = new RescheduleRequestUseCase(
        activityRepo as unknown as ITenantPortalActivityRepository,
        tokenRepo as unknown as ITenantPortalTokenRepository,
        appointmentRepo as unknown as IAppointmentRepository,
        serviceTypeRepo as unknown as IServiceTypeRepository,
        executionRepo as unknown as IInspectionExecutionRepository,
        tenantRepo as unknown as ITenantRepository,
        auditService,
        reopenForReschedule as unknown as ReopenForRescheduleUseCase,
        undefined,
        eventBus,
      );

      const newDate = new Date(Date.now() + 7 * 24 * 3600 * 1000)
        .toISOString()
        .split('T')[0]!;
      await useCase.execute({
        tokenId: 'token-1',
        appointmentId: 'appt-1',
        isReadOnly: false,
        isUsed: false,
        newDate,
        newTimeSlotStart: '14:00', newTimeSlotEnd: '17:00',
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      });

      expect(emitted).toHaveLength(1);
      expect((emitted[0] as any).type).toBe(TENANT_PORTAL_EVENTS.RESCHEDULED);
      expect((emitted[0] as any).payload.appointmentId).toBe('appt-1');
      expect((emitted[0] as any).payload.newDate).toBe(newDate);
    });
  });
});

// =========================================================================
// GAP-003: Token replay detection
// =========================================================================

describe('GAP-003: Token replay detection', () => {
  describe('ConfirmAppointmentUseCase rejects used tokens', () => {
    it('throws PortalTokenAlreadyUsedError when token is already used', async () => {
      const activityRepo = makeActivityRepo();
      const appointmentRepo = makeAppointmentRepo();
      const auditService = { log: vi.fn() } as unknown as PersistentAuditService;

      const useCase = new ConfirmAppointmentUseCase(
        activityRepo as unknown as ITenantPortalActivityRepository,
        appointmentRepo as unknown as IAppointmentRepository,
        auditService,
      );

      await expect(useCase.execute({
        tokenId: 'token-1',
        appointmentId: 'appt-1',
        isReadOnly: false,
        isUsed: true,
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      })).rejects.toThrow(PortalTokenAlreadyUsedError);

      expect(appointmentRepo.findById).not.toHaveBeenCalled();
    });

    it('marks token as used on successful confirmation', async () => {
      const activityRepo = makeActivityRepo();
      const appointmentRepo = makeAppointmentRepo();
      const auditService = { log: vi.fn() } as unknown as PersistentAuditService;
      const tokenRepo = makeTokenRepo();

      const useCase = new ConfirmAppointmentUseCase(
        activityRepo as unknown as ITenantPortalActivityRepository,
        appointmentRepo as unknown as IAppointmentRepository,
        auditService,
        undefined,
        undefined,
        tokenRepo as unknown as ITenantPortalTokenRepository,
      );

      await useCase.execute({
        tokenId: 'token-1',
        appointmentId: 'appt-1',
        isReadOnly: false,
        isUsed: false,
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      });

      expect(tokenRepo.markUsed).toHaveBeenCalledWith('token-1');
    });
  });

  describe('RescheduleRequestUseCase rejects used tokens', () => {
    function buildRescheduleUseCase() {
      const activityRepo = makeActivityRepo();
      const tokenRepo = makeTokenRepo();
      const appointmentRepo = makeAppointmentRepo({ status: 'SCHEDULED', inspectorId: 'insp-1' });
      const serviceTypeRepo = { findById: vi.fn().mockResolvedValue(makeServiceType()), findByCode: vi.fn(), findAll: vi.fn(), count: vi.fn(), save: vi.fn(), update: vi.fn() };
      const executionRepo = { findByAppointmentId: vi.fn().mockResolvedValue(null) };
      const tenantRepo = { findById: vi.fn().mockResolvedValue(makeTenant()) };
      const auditService = { log: vi.fn() } as unknown as PersistentAuditService;
      const reopenForReschedule = {
        execute: vi.fn().mockResolvedValue({
          id: 'appt-1', previousStatus: 'SCHEDULED', status: 'DRAFT',
          scheduledDate: '2026-04-20', timeSlotStart: '14:00', timeSlotEnd: '17:00',
          tenantConfirmationStatus: 'PENDING',
        }),
      };

      return {
        useCase: new RescheduleRequestUseCase(
          activityRepo as unknown as ITenantPortalActivityRepository,
          tokenRepo as unknown as ITenantPortalTokenRepository,
          appointmentRepo as unknown as IAppointmentRepository,
          serviceTypeRepo as unknown as IServiceTypeRepository,
          executionRepo as unknown as IInspectionExecutionRepository,
          tenantRepo as unknown as ITenantRepository,
          auditService,
          reopenForReschedule as unknown as ReopenForRescheduleUseCase,
        ),
        tokenRepo,
        appointmentRepo,
      };
    }

    it('throws PortalTokenAlreadyUsedError when token is already used', async () => {
      const { useCase, appointmentRepo } = buildRescheduleUseCase();

      await expect(useCase.execute({
        tokenId: 'token-1',
        appointmentId: 'appt-1',
        isReadOnly: false,
        isUsed: true,
        newDate: new Date(Date.now() + 7*24*3600*1000).toISOString().split('T')[0]!,
        newTimeSlotStart: '14:00', newTimeSlotEnd: '17:00',
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      })).rejects.toThrow(PortalTokenAlreadyUsedError);

      expect(appointmentRepo.findById).not.toHaveBeenCalled();
    });

    it('marks token as used on successful reschedule', async () => {
      const { useCase, tokenRepo } = buildRescheduleUseCase();

      await useCase.execute({
        tokenId: 'token-1',
        appointmentId: 'appt-1',
        isReadOnly: false,
        isUsed: false,
        newDate: new Date(Date.now() + 7*24*3600*1000).toISOString().split('T')[0]!,
        newTimeSlotStart: '14:00', newTimeSlotEnd: '17:00',
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      });

      expect(tokenRepo.markUsed).toHaveBeenCalledWith('token-1');
    });
  });

  describe('ReportUnavailabilityUseCase rejects used tokens', () => {
    it('throws PortalTokenAlreadyUsedError when token is already used', async () => {
      const activityRepo = makeActivityRepo();
      const appointmentRepo = makeAppointmentRepo();
      const auditService = { log: vi.fn() } as unknown as PersistentAuditService;

      const useCase = new ReportUnavailabilityUseCase(
        activityRepo as unknown as ITenantPortalActivityRepository,
        appointmentRepo as unknown as IAppointmentRepository,
        auditService,
      );

      await expect(useCase.execute({
        tokenId: 'token-1',
        appointmentId: 'appt-1',
        isReadOnly: false,
        isUsed: true,
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      })).rejects.toThrow(PortalTokenAlreadyUsedError);
    });

    it('marks token as used on successful report', async () => {
      const activityRepo = makeActivityRepo();
      const appointmentRepo = makeAppointmentRepo();
      const auditService = { log: vi.fn() } as unknown as PersistentAuditService;
      const tokenRepo = makeTokenRepo();

      const useCase = new ReportUnavailabilityUseCase(
        activityRepo as unknown as ITenantPortalActivityRepository,
        appointmentRepo as unknown as IAppointmentRepository,
        auditService,
        undefined,
        undefined,
        undefined,
        tokenRepo as unknown as ITenantPortalTokenRepository,
      );

      await useCase.execute({
        tokenId: 'token-1',
        appointmentId: 'appt-1',
        isReadOnly: false,
        isUsed: false,
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      });

      expect(tokenRepo.markUsed).toHaveBeenCalledWith('token-1');
    });
  });

  describe('Contact update does NOT consume the token', () => {
    it('UpdateContactInput does not have isUsed field', async () => {
      const activityRepo = makeActivityRepo();
      const appointmentRepo = makeAppointmentRepo();
      const auditService = { log: vi.fn() } as unknown as PersistentAuditService;

      const useCase = new UpdateContactUseCase(
        activityRepo as unknown as ITenantPortalActivityRepository,
        appointmentRepo as unknown as IAppointmentRepository,
        auditService,
      );

      // Contact update should succeed regardless of token used state
      const result = await useCase.execute({
        tokenId: 'token-1',
        appointmentId: 'appt-1',
        isReadOnly: false,
        contact: { primaryEmail: 'new@test.com' },
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      });

      expect(result.primaryEmail).toBe('new@test.com');
    });
  });
});

// =========================================================================
// GAP-004: Auto-generate new token on reschedule
// =========================================================================

describe('GAP-004: Auto-generate new token on reschedule', () => {
  function buildRescheduleWithTokenGen() {
    const activityRepo = makeActivityRepo();
    const tokenRepo = makeTokenRepo();
    const appointmentRepo = makeAppointmentRepo({ status: 'SCHEDULED', inspectorId: 'insp-1' });
    const serviceTypeRepo = { findById: vi.fn().mockResolvedValue(makeServiceType()), findByCode: vi.fn(), findAll: vi.fn(), count: vi.fn(), save: vi.fn(), update: vi.fn() };
    const executionRepo = { findByAppointmentId: vi.fn().mockResolvedValue(null) };
    const tenantRepo = { findById: vi.fn().mockResolvedValue(makeTenant()) };
    const auditService = { log: vi.fn() } as unknown as PersistentAuditService;
    const reopenForReschedule = {
      execute: vi.fn().mockImplementation(async (input: { newScheduledDate: string; newTimeSlot: string }) => ({
        id: 'appt-1', previousStatus: 'SCHEDULED', status: 'DRAFT',
        scheduledDate: input.newScheduledDate, timeSlot: input.newTimeSlot,
        tenantConfirmationStatus: 'PENDING',
      })),
    };
    const generatePortalTokenUseCase = {
      execute: vi.fn().mockResolvedValue({ token: 'new-raw-token', expiresAt: new Date('2026-04-25') }),
    };

    const useCase = new RescheduleRequestUseCase(
      activityRepo as unknown as ITenantPortalActivityRepository,
      tokenRepo as unknown as ITenantPortalTokenRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      serviceTypeRepo as unknown as IServiceTypeRepository,
      executionRepo as unknown as IInspectionExecutionRepository,
      tenantRepo as unknown as ITenantRepository,
      auditService,
      reopenForReschedule as unknown as ReopenForRescheduleUseCase,
      undefined,
      undefined,
      generatePortalTokenUseCase as any,
    );

    return { useCase, generatePortalTokenUseCase, tokenRepo };
  }

  it('calls GeneratePortalTokenUseCase after successful reschedule', async () => {
    const { useCase, generatePortalTokenUseCase } = buildRescheduleWithTokenGen();

    await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      newDate: new Date(Date.now() + 7*24*3600*1000).toISOString().split('T')[0]!,
      newTimeSlotStart: '14:00', newTimeSlotEnd: '17:00',
      ipAddress: '127.0.0.1',
      userAgent: 'Test/1.0',
    });

    expect(generatePortalTokenUseCase.execute).toHaveBeenCalledOnce();
    expect(generatePortalTokenUseCase.execute).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      actor: {
        userId: 'SYSTEM',
        tenantId: 'tenant-1',
        role: 'OP',
      },
      // Reopen-for-reschedule moves the appointment to DRAFT; the re-issued
      // link must bypass the operator-facing status gate.
      allowAnyStatus: true,
    });
  });

  it('reschedule succeeds even if token generation fails', async () => {
    const { useCase, generatePortalTokenUseCase } = buildRescheduleWithTokenGen();
    generatePortalTokenUseCase.execute.mockRejectedValueOnce(new Error('Token generation failure'));

    const newDate = new Date(Date.now() + 7 * 24 * 3600 * 1000)
      .toISOString()
      .split('T')[0]!;
    const result = await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      newDate,
      newTimeSlotStart: '14:00', newTimeSlotEnd: '17:00',
      ipAddress: '127.0.0.1',
      userAgent: 'Test/1.0',
    });

    expect(result.tenantConfirmationStatus).toBe('PENDING');
    expect(result.scheduledDate).toBe(newDate);
  });

  it('does not generate token when generatePortalTokenUseCase is not provided', async () => {
    const activityRepo = makeActivityRepo();
    const tokenRepo = makeTokenRepo();
    const appointmentRepo = makeAppointmentRepo({ status: 'SCHEDULED', inspectorId: 'insp-1' });
    const serviceTypeRepo = { findById: vi.fn().mockResolvedValue(makeServiceType()), findByCode: vi.fn(), findAll: vi.fn(), count: vi.fn(), save: vi.fn(), update: vi.fn() };
    const executionRepo = { findByAppointmentId: vi.fn().mockResolvedValue(null) };
    const tenantRepo = { findById: vi.fn().mockResolvedValue(makeTenant()) };
    const auditService = { log: vi.fn() } as unknown as PersistentAuditService;
    const reopenForReschedule = {
      execute: vi.fn().mockImplementation(async (input: { newScheduledDate: string; newTimeSlot: string }) => ({
        id: 'appt-1', previousStatus: 'SCHEDULED', status: 'DRAFT',
        scheduledDate: input.newScheduledDate, timeSlot: input.newTimeSlot,
        tenantConfirmationStatus: 'PENDING',
      })),
    };

    const useCase = new RescheduleRequestUseCase(
      activityRepo as unknown as ITenantPortalActivityRepository,
      tokenRepo as unknown as ITenantPortalTokenRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      serviceTypeRepo as unknown as IServiceTypeRepository,
      executionRepo as unknown as IInspectionExecutionRepository,
      tenantRepo as unknown as ITenantRepository,
      auditService,
      reopenForReschedule as unknown as ReopenForRescheduleUseCase,
    );

    // Should not throw even without generatePortalTokenUseCase
    const result = await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      newDate: new Date(Date.now() + 7*24*3600*1000).toISOString().split('T')[0]!,
      newTimeSlotStart: '14:00', newTimeSlotEnd: '17:00',
      ipAddress: '127.0.0.1',
      userAgent: 'Test/1.0',
    });

    expect(result.tenantConfirmationStatus).toBe('PENDING');
  });
});
