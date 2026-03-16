import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeactivateBranchUseCase } from '../../../src/modules/tenant/application/use-cases/deactivate-branch.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { IAppointmentChecker } from '../../../src/modules/tenant/domain/appointment-checker';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import {
  BranchNotFoundError,
  BranchAlreadyInactiveError,
  BranchHasOpenAppointmentsError,
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

function makeBranch(
  overrides: Partial<ConstructorParameters<typeof BranchEntity>[0]> = {},
): BranchEntity {
  return new BranchEntity({
    id: 'branch-1',
    tenantId: 'tenant-1',
    name: 'Main Branch',
    addressJson: null,
    status: 'ACTIVE',
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
    ...overrides,
  };
}

describe('DeactivateBranchUseCase', () => {
  let tenantRepo: ITenantRepository;
  let branchRepo: IBranchRepository;
  let appointmentChecker: IAppointmentChecker;
  let auditService: AuditService;
  let useCase: DeactivateBranchUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    branchRepo = {
      findById: vi.fn(),
      findByName: vi.fn(),
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
    useCase = new DeactivateBranchUseCase(
      tenantRepo,
      branchRepo,
      appointmentChecker,
      auditService,
    );
  });

  it('should deactivate an active branch when actor is AM', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      reason: 'Branch closed',
      actor: makeActor(),
    });

    expect(branchRepo.update).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({ status: 'INACTIVE', deletedAt: expect.any(Date) }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branch.deactivated',
        reason: 'Branch closed',
      }),
    );
  });

  it('should reject non-AM roles with AUTH_FORBIDDEN', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        reason: 'Reason',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw BRANCH_ALREADY_INACTIVE when branch is inactive', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(
      makeBranch({ status: 'INACTIVE' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        reason: 'Reason',
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchAlreadyInactiveError);
  });

  it('should throw BRANCH_HAS_OPEN_APPOINTMENTS when branch has open appointments', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(appointmentChecker.hasOpenAppointmentsForBranch).mockResolvedValue(
      true,
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        reason: 'Reason',
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchHasOpenAppointmentsError);
  });

  it('should throw BRANCH_NOT_FOUND when branch does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'nonexistent',
        reason: 'Reason',
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNotFoundError);
  });
});
