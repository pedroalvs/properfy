import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateBranchUseCase } from '../../../src/modules/tenant/application/use-cases/create-branch.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import {
  TenantNotFoundError,
  TenantInactiveError,
  BranchNameConflictError,
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
    inspectorId: null,
    ...overrides,
  };
}

describe('CreateBranchUseCase', () => {
  let tenantRepo: ITenantRepository;
  let branchRepo: IBranchRepository;
  let auditService: AuditService;
  let useCase: CreateBranchUseCase;

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
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new CreateBranchUseCase(tenantRepo, branchRepo, auditService);
  });

  it('should create a branch when actor is AM', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findByName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New Branch',
      actor: makeActor(),
    });

    expect(result.name).toBe('New Branch');
    expect(result.status).toBe('ACTIVE');
    expect(result.tenantId).toBe('tenant-1');
    expect(branchRepo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'branch.created' }),
    );
  });

  it('should allow CL_ADMIN to create branch for own tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findByName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New Branch',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.name).toBe('New Branch');
  });

  it('should reject CL_ADMIN creating branch for other tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New Branch',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-other' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw TENANT_INACTIVE when tenant is not active', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ status: 'PENDING' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'New Branch',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantInactiveError);
  });

  it('should throw BRANCH_NAME_CONFLICT when name is taken within tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findByName).mockResolvedValue(makeBranch());

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        name: 'Main Branch',
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNameConflictError);
  });

  it('should create branch with contactEmail', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findByName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New Branch',
      contactEmail: 'pm@agency.com',
      actor: makeActor(),
    });

    expect(result.contactEmail).toBe('pm@agency.com');
  });

  it('should create branch without contactEmail (defaults to null)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findByName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      name: 'New Branch',
      actor: makeActor(),
    });

    expect(result.contactEmail).toBeNull();
  });

  it('should throw TENANT_NOT_FOUND when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'nonexistent',
        name: 'Branch',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantNotFoundError);
  });
});
