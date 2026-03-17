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
import type { TokenService } from '../../../src/modules/tenant-portal/domain/token.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';

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

describe('GeneratePortalTokenUseCase', () => {
  let tokenRepo: {
    findByTokenHash: ReturnType<typeof vi.fn>;
    findActiveByAppointmentId: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    updateLastAccessedAt: ReturnType<typeof vi.fn>;
    revokeAllForAppointment: ReturnType<typeof vi.fn>;
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
  let tokenService: {
    generateRawToken: ReturnType<typeof vi.fn>;
    hashToken: ReturnType<typeof vi.fn>;
    computeExpiresAt: ReturnType<typeof vi.fn>;
  };
  let auditService: { log: ReturnType<typeof vi.fn> };
  let useCase: GeneratePortalTokenUseCase;

  beforeEach(() => {
    tokenRepo = {
      findByTokenHash: vi.fn(),
      findActiveByAppointmentId: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn(),
      updateLastAccessedAt: vi.fn(),
      revokeAllForAppointment: vi.fn().mockResolvedValue(undefined),
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
    };
    tenantRepo = {
      findById: vi.fn().mockResolvedValue(makeTenant()),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    tokenService = {
      generateRawToken: vi.fn().mockReturnValue('raw-token-64-chars-hex-string-for-testing-purposes-1234567890ab'),
      hashToken: vi.fn().mockReturnValue('hashed-token-sha256'),
      computeExpiresAt: vi.fn().mockReturnValue(new Date('2026-04-14T08:00:00Z')),
    };
    auditService = { log: vi.fn() };

    useCase = new GeneratePortalTokenUseCase(
      tokenRepo as unknown as ITenantPortalTokenRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      tenantRepo as unknown as ITenantRepository,
      tokenService as unknown as TokenService,
      auditService as unknown as PersistentAuditService,
    );
  });

  it('should generate token successfully for AM actor', async () => {
    const result = await useCase.execute(makeInput({ actor: makeAMContext() }));

    expect(result.rawToken).toBe('raw-token-64-chars-hex-string-for-testing-purposes-1234567890ab');
    expect(result.expiresAt).toEqual(new Date('2026-04-14T08:00:00Z'));

    // AM passes null tenantId for query
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
  });

  it('should generate token successfully for OP actor', async () => {
    const result = await useCase.execute(makeInput({ actor: makeOPContext() }));

    expect(result.rawToken).toBe('raw-token-64-chars-hex-string-for-testing-purposes-1234567890ab');
    expect(result.expiresAt).toEqual(new Date('2026-04-14T08:00:00Z'));

    // OP passes their tenantId for query
    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', 'tenant-1');
  });

  it('should revoke existing tokens before creating new one', async () => {
    await useCase.execute(makeInput());

    expect(tokenRepo.revokeAllForAppointment).toHaveBeenCalledWith('appt-1');

    // revokeAll should be called before save
    const revokeOrder = tokenRepo.revokeAllForAppointment.mock.invocationCallOrder[0];
    const saveOrder = tokenRepo.save.mock.invocationCallOrder[0];
    expect(revokeOrder).toBeLessThan(saveOrder);
  });

  it('should return raw token (not hash)', async () => {
    const result = await useCase.execute(makeInput());

    expect(result.rawToken).toBe('raw-token-64-chars-hex-string-for-testing-purposes-1234567890ab');
    expect(result.rawToken).not.toBe('hashed-token-sha256');
  });

  it('should save token entity with hashed token', async () => {
    await useCase.execute(makeInput());

    expect(tokenRepo.save).toHaveBeenCalledTimes(1);
    const savedToken = tokenRepo.save.mock.calls[0][0];
    expect(savedToken.tokenHash).toBe('hashed-token-sha256');
    expect(savedToken.appointmentId).toBe('appt-1');
    expect(savedToken.status).toBe('ACTIVE');
    expect(savedToken.lastAccessedAt).toBeNull();
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

  it('should throw NotFoundError when appointment not found', async () => {
    appointmentRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(makeInput())).rejects.toThrow(NotFoundError);
  });

  it('should throw NotFoundError when tenant not found', async () => {
    tenantRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(makeInput())).rejects.toThrow(NotFoundError);
  });

  it('should use tenant timezone for computing expiry', async () => {
    tenantRepo.findById.mockResolvedValue(makeTenant({ timezone: 'America/Sao_Paulo' }));

    await useCase.execute(makeInput());

    expect(tokenService.computeExpiresAt).toHaveBeenCalledWith('2026-04-15', 'America/Sao_Paulo');
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
});
