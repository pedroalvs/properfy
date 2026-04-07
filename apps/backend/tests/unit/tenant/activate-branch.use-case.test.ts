import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivateBranchUseCase } from '../../../src/modules/tenant/application/use-cases/activate-branch.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import {
  TenantNotFoundError,
  BranchNotFoundError,
  BranchAlreadyActiveError,
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
    contactEmail: null,
    status: 'INACTIVE',
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

describe('ActivateBranchUseCase', () => {
  let tenantRepo: ITenantRepository;
  let branchRepo: IBranchRepository;
  let auditService: AuditService;
  let useCase: ActivateBranchUseCase;

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
      countByTenantIds: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new ActivateBranchUseCase(
      tenantRepo,
      branchRepo,
      auditService,
    );
  });

  it('should activate an inactive branch when actor is AM', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      actor: makeActor(),
    });

    expect(branchRepo.update).toHaveBeenCalledWith(
      'branch-1',
      'tenant-1',
      { status: 'ACTIVE' },
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branch.activated',
        before: { status: 'INACTIVE' },
        after: { status: 'ACTIVE' },
      }),
    );
    expect(result.status).toBe('ACTIVE');
    expect(result.id).toBe('branch-1');
    expect(result.activatedAt).toBeInstanceOf(Date);
  });

  it('should throw BranchAlreadyActiveError when branch is already active', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(
      makeBranch({ status: 'ACTIVE' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchAlreadyActiveError);
  });

  it('should reject non-AM roles with ForbiddenError', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw BranchNotFoundError when branch does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'nonexistent',
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNotFoundError);
  });

  it('should throw TenantNotFoundError when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'nonexistent',
        branchId: 'branch-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantNotFoundError);
  });
});
