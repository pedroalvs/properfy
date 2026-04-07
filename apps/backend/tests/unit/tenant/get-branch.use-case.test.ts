import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetBranchUseCase } from '../../../src/modules/tenant/application/use-cases/get-branch.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import {
  TenantNotFoundError,
  BranchNotFoundError,
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
    addressJson: { street: '123 Test St' },
    contactEmail: 'branch@test.com',
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

describe('GetBranchUseCase', () => {
  let tenantRepo: ITenantRepository;
  let branchRepo: IBranchRepository;
  let useCase: GetBranchUseCase;

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
    useCase = new GetBranchUseCase(tenantRepo, branchRepo);
  });

  it('should return branch data when actor is AM', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      actor: makeActor(),
    });

    expect(result.id).toBe('branch-1');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.name).toBe('Main Branch');
    expect(result.contactEmail).toBe('branch@test.com');
    expect(tenantRepo.findById).toHaveBeenCalledWith('tenant-1');
    expect(branchRepo.findById).toHaveBeenCalledWith('branch-1', 'tenant-1');
  });

  it('should return branch data when actor is OP', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.id).toBe('branch-1');
  });

  it('should return branch data when CL_ADMIN accesses own tenant branch', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.id).toBe('branch-1');
  });

  it('should return branch data when CL_USER accesses own tenant branch', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
    });

    expect(result.id).toBe('branch-1');
  });

  it('should throw ForbiddenError when CL_ADMIN accesses other tenant branch', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-other' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError when CL_USER accesses other tenant branch', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-other' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError when INSP tries to access branch', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
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

  it('should throw TenantNotFoundError when tenant is deleted', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ deletedAt: new Date() }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantNotFoundError);
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

  it('should throw BranchNotFoundError when branch is deleted', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(
      makeBranch({ deletedAt: new Date() }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNotFoundError);
  });
});
