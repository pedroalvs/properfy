import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeactivateTenantUseCase } from '../../../src/modules/tenant/application/use-cases/deactivate-tenant.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IAppointmentChecker } from '../../../src/modules/tenant/domain/appointment-checker';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import {
  TenantNotFoundError,
  TenantAlreadyInactiveError,
  TenantHasOpenAppointmentsError,
} from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeTenant(
  overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {},
): TenantEntity {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
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

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-am-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('DeactivateTenantUseCase', () => {
  let tenantRepo: ITenantRepository;
  let appointmentChecker: IAppointmentChecker;
  let auditService: AuditService;
  let useCase: DeactivateTenantUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    appointmentChecker = {
      hasOpenAppointmentsForTenant: vi.fn().mockResolvedValue(false),
      hasOpenAppointmentsForBranch: vi.fn().mockResolvedValue(false),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new DeactivateTenantUseCase(
      tenantRepo,
      appointmentChecker,
      auditService,
    );
  });

  it('should deactivate an active tenant when actor is AM', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    await useCase.execute({
      tenantId: 'tenant-1',
      reason: 'Contract ended',
      actor: makeActor(),
    });

    expect(tenantRepo.update).toHaveBeenCalledWith(
      'tenant-1',
      { status: 'INACTIVE' },
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.deactivated',
        reason: 'Contract ended',
      }),
    );
  });

  it('should reject non-AM roles with AUTH_FORBIDDEN', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        reason: 'Reason',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw TENANT_ALREADY_INACTIVE when tenant is already inactive', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ status: 'INACTIVE' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        reason: 'Reason',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantAlreadyInactiveError);
  });

  it('should throw TENANT_HAS_OPEN_APPOINTMENTS when tenant has open appointments', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(appointmentChecker.hasOpenAppointmentsForTenant).mockResolvedValue(
      true,
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        reason: 'Reason',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantHasOpenAppointmentsError);
  });

  it('should throw TENANT_NOT_FOUND when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'nonexistent',
        reason: 'Reason',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantNotFoundError);
  });
});
