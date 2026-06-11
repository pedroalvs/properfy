import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GeneratePortalTokenUseCase,
  type AuthContext,
  type GeneratePortalTokenInput,
} from '../../../src/modules/tenant-portal/application/use-cases/generate-portal-token.use-case';
import type { ITenantPortalTokenRepository } from '../../../src/modules/tenant-portal/domain/tenant-portal-token.repository';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import type { MintPortalTokenService } from '../../../src/modules/tenant-portal/domain/mint-portal-token.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';

function makeAppointment(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'stype-1',
    inspectorId: 'inspector-1',
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-04-15'),
    timeSlot: 'MORNING',
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

function makeTenant(overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {}) {
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
    ...overrides,
  });
}

function makeAMContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'admin-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeOPContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'operator-1',
    tenantId: 'tenant-1',
    role: 'OP',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeInput(overrides: Partial<GeneratePortalTokenInput> = {}): GeneratePortalTokenInput {
  return {
    appointmentId: 'appt-1',
    actor: makeAMContext(),
    ...overrides,
  };
}

const RAW_TOKEN = 'raw-token-64-chars-hex-string-for-testing-purposes-1234567890ab';
const EXPIRES_AT = new Date('2026-04-14T08:00:00Z');

describe('GeneratePortalTokenUseCase', () => {
  let tokenRepo: {
    findByTokenHash: ReturnType<typeof vi.fn>;
    findActiveByAppointmentId: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    revokeAndSave: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    updateLastAccessedAt: ReturnType<typeof vi.fn>;
    markUsed: ReturnType<typeof vi.fn>;
    revokeAllForAppointment: ReturnType<typeof vi.fn>;
    expireActiveTokens: ReturnType<typeof vi.fn>;
  };
  let appointmentRepo: {
    findById: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    saveContact: ReturnType<typeof vi.fn>;
    updateContact: ReturnType<typeof vi.fn>;
    saveRestriction: ReturnType<typeof vi.fn>;
    deleteRestrictionsByAppointmentId: ReturnType<typeof vi.fn>;
  };
  let tenantRepo: {
    findById: ReturnType<typeof vi.fn>;
    findByLegalName: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mintPortalTokenService: { mint: ReturnType<typeof vi.fn> };
  let auditService: { log: ReturnType<typeof vi.fn> };
  let useCase: GeneratePortalTokenUseCase;

  beforeEach(() => {
    tokenRepo = {
      findByTokenHash: vi.fn(),
      findActiveByAppointmentId: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      revokeAndSave: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn(),
      updateLastAccessedAt: vi.fn(),
      markUsed: vi.fn().mockResolvedValue(undefined),
      revokeAllForAppointment: vi.fn().mockResolvedValue(undefined),
      expireActiveTokens: vi.fn().mockResolvedValue(0),
    };
    appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment(),
        contact: null,
        restrictions: [],
      }),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
      findScheduledOnDate: vi.fn(),
    };
    tenantRepo = {
      findById: vi.fn().mockResolvedValue(makeTenant()),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    mintPortalTokenService = {
      mint: vi.fn().mockResolvedValue({ rawToken: RAW_TOKEN, expiresAt: EXPIRES_AT }),
    };
    auditService = { log: vi.fn() };

    useCase = new GeneratePortalTokenUseCase(
      tokenRepo as unknown as ITenantPortalTokenRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      tenantRepo as unknown as ITenantRepository,
      mintPortalTokenService as unknown as MintPortalTokenService,
      auditService as unknown as PersistentAuditService,
    );
  });

  it('should generate token successfully for AM actor', async () => {
    const result = await useCase.execute(makeInput({ actor: makeAMContext() }));

    expect(result.token).toBe(RAW_TOKEN);
    expect(result.expiresAt).toEqual(EXPIRES_AT);
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
  });

  it('should generate token successfully for OP actor', async () => {
    const result = await useCase.execute(makeInput({ actor: makeOPContext() }));

    expect(result.token).toBe(RAW_TOKEN);
    expect(result.expiresAt).toEqual(EXPIRES_AT);
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', 'tenant-1');
  });

  it('should call mintPortalTokenService.mint with the loaded appointment and tenant', async () => {
    const appointment = makeAppointment();
    const tenant = makeTenant();
    appointmentRepo.findById.mockResolvedValueOnce({ appointment, contact: null, restrictions: [] });
    tenantRepo.findById.mockResolvedValueOnce(tenant);

    await useCase.execute(makeInput());

    expect(mintPortalTokenService.mint).toHaveBeenCalledWith(appointment, tenant);
  });

  it('should return the raw token from mintPortalTokenService.mint', async () => {
    const result = await useCase.execute(makeInput());

    expect(result.token).toBe(RAW_TOKEN);
    expect(result.expiresAt).toEqual(EXPIRES_AT);
  });

  it('should throw ForbiddenError for CL_ADMIN role', async () => {
    await expect(
      useCase.execute(
        makeInput({
          actor: { userId: 'client-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null },
        }),
      ),
    ).rejects.toThrow(ForbiddenError);

    expect(appointmentRepo.findById).not.toHaveBeenCalled();
  });

  it('should throw ForbiddenError for INSP role', async () => {
    await expect(
      useCase.execute(
        makeInput({
          actor: { userId: 'insp-1', tenantId: null, role: 'INSP', branchId: null, inspectorId: null },
        }),
      ),
    ).rejects.toThrow(ForbiddenError);

    expect(appointmentRepo.findById).not.toHaveBeenCalled();
  });

  it('should throw ForbiddenError for CL_USER role', async () => {
    await expect(
      useCase.execute(
        makeInput({
          actor: { userId: 'user-1', tenantId: 'tenant-1', role: 'CL_USER', branchId: null, inspectorId: null },
        }),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  // Portal link is only meaningful once the appointment leaves DRAFT and is
  // not terminal: AWAITING_INSPECTOR and SCHEDULED are the only valid states.
  it.each(['DRAFT', 'DONE', 'CANCELLED', 'REJECTED'] as const)(
    'should throw ConflictError and not mint a token for %s appointments',
    async (status) => {
      appointmentRepo.findById.mockResolvedValueOnce({
        appointment: makeAppointment({ status }),
        contact: null,
        restrictions: [],
      });

      await expect(useCase.execute(makeInput())).rejects.toThrow(ConflictError);
      expect(mintPortalTokenService.mint).not.toHaveBeenCalled();
    },
  );

  // GAP-004: the portal reschedule flow reopens the appointment to DRAFT and
  // then re-issues a fresh token for the new date — that internal caller must
  // bypass the operator-facing status gate.
  it('should skip the status gate when allowAnyStatus is set (reschedule re-issue)', async () => {
    appointmentRepo.findById.mockResolvedValueOnce({
      appointment: makeAppointment({ status: 'DRAFT' }),
      contact: null,
      restrictions: [],
    });

    const result = await useCase.execute(makeInput({ allowAnyStatus: true }));

    expect(result.token).toBe(RAW_TOKEN);
    expect(mintPortalTokenService.mint).toHaveBeenCalled();
  });

  it('should generate token for AWAITING_INSPECTOR appointments', async () => {
    appointmentRepo.findById.mockResolvedValueOnce({
      appointment: makeAppointment({ status: 'AWAITING_INSPECTOR' }),
      contact: null,
      restrictions: [],
    });

    const result = await useCase.execute(makeInput());

    expect(result.token).toBe(RAW_TOKEN);
  });

  it('should throw NotFoundError when appointment not found', async () => {
    appointmentRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(makeInput())).rejects.toThrow(NotFoundError);
    expect(mintPortalTokenService.mint).not.toHaveBeenCalled();
  });

  it('should throw NotFoundError when tenant not found', async () => {
    tenantRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(makeInput())).rejects.toThrow(NotFoundError);
    expect(mintPortalTokenService.mint).not.toHaveBeenCalled();
  });

  it('should call audit service with USER actor type and actor details', async () => {
    await useCase.execute(makeInput({ actor: makeAMContext({ userId: 'admin-42' }) }));

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant_portal.token_generated',
        actorType: 'USER',
        actorId: 'admin-42',
        entityType: 'tenant_portal_token',
        tenantId: 'tenant-1',
        metadata: expect.objectContaining({
          appointmentId: 'appt-1',
          expiresAt: expect.any(String),
        }),
      }),
    );
  });

  // Regression: Bug B-5 round 2 (QA 2026-04-19). The notification send step
  // is a side effect; if the template is missing or the provider fails, the
  // endpoint must still return the freshly persisted token rather than
  // surface the failure as a 500.
  it('still returns the token when the notification send throws', async () => {
    const failingNotificationUseCase = {
      execute: vi.fn().mockRejectedValue(new Error('template TENANT_PORTAL_LINK not found')),
    };
    // 023 §FR-221: dispatch only fires when the contact is the primary
    // recipient. Use a primary contact to exercise the notification path.
    const contact = {
      isPrimary: true,
      effectiveName: 'Jane Doe',
      effectiveEmail: 'jane@example.com',
      effectivePhone: null,
    };
    appointmentRepo.findById.mockResolvedValueOnce({
      appointment: makeAppointment(),
      contact,
      restrictions: [],
    });

    const uc = new GeneratePortalTokenUseCase(
      tokenRepo as unknown as ITenantPortalTokenRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      tenantRepo as unknown as ITenantRepository,
      mintPortalTokenService as unknown as MintPortalTokenService,
      auditService as unknown as PersistentAuditService,
      failingNotificationUseCase as any,
    );

    const result = await uc.execute(makeInput({ actor: makeAMContext() }));

    expect(mintPortalTokenService.mint).toHaveBeenCalled();
    expect(failingNotificationUseCase.execute).toHaveBeenCalledTimes(1);
    expect(result.token).toBeTruthy();
    expect(result.expiresAt).toBeInstanceOf(Date);
    // The token survives, but the caller must know the email never went out —
    // the UI used to show "Email sent to tenant" over a swallowed failure.
    expect(result.dispatched).toBe(false);
    expect(result.reason).toBe('DISPATCH_FAILED');
  });

  it('returns dispatched: true when the notification is created successfully', async () => {
    const notificationUseCase = {
      execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
    };
    const contact = {
      isPrimary: true,
      effectiveName: 'Jane Doe',
      effectiveEmail: 'jane@example.com',
      effectivePhone: null,
    };
    appointmentRepo.findById.mockResolvedValueOnce({
      appointment: makeAppointment(),
      contact,
      restrictions: [],
    });

    const uc = new GeneratePortalTokenUseCase(
      tokenRepo as unknown as ITenantPortalTokenRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      tenantRepo as unknown as ITenantRepository,
      mintPortalTokenService as unknown as MintPortalTokenService,
      auditService as unknown as PersistentAuditService,
      notificationUseCase as any,
    );

    const result = await uc.execute(makeInput({ actor: makeAMContext() }));

    expect(result.dispatched).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns dispatched: true when only one of two channels fails', async () => {
    const notificationUseCase = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ notificationId: 'notif-email' })
        .mockRejectedValueOnce(new Error('sms provider down')),
    };
    const contact = {
      isPrimary: true,
      effectiveName: 'Jane Doe',
      effectiveEmail: 'jane@example.com',
      effectivePhone: '+61400000000',
    };
    appointmentRepo.findById.mockResolvedValueOnce({
      appointment: makeAppointment(),
      contact,
      restrictions: [],
    });

    const uc = new GeneratePortalTokenUseCase(
      tokenRepo as unknown as ITenantPortalTokenRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      tenantRepo as unknown as ITenantRepository,
      mintPortalTokenService as unknown as MintPortalTokenService,
      auditService as unknown as PersistentAuditService,
      notificationUseCase as any,
    );

    const result = await uc.execute(makeInput({ actor: makeAMContext() }));

    expect(result.dispatched).toBe(true);
  });
});
