import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateBranchUseCase } from '../../../src/modules/tenant/application/use-cases/update-branch.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import {
  BranchNotFoundError,
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

describe('UpdateBranchUseCase', () => {
  let tenantRepo: ITenantRepository;
  let branchRepo: IBranchRepository;
  let auditService: AuditService;
  let useCase: UpdateBranchUseCase;

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
    useCase = new UpdateBranchUseCase(tenantRepo, branchRepo, auditService);
  });

  it('should allow AM to update branch', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(branchRepo.findByName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      data: { name: 'Updated Branch', address: { street: '123 Main St' } },
      actor: makeActor(),
    });

    expect(result.name).toBe('Updated Branch');
    expect(result.addressJson).toEqual({ street: '123 Main St' });
    expect(branchRepo.update).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'branch.updated' }),
    );
  });

  it('should allow CL_ADMIN to update own tenant branch (name+address)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(branchRepo.findByName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      data: { name: 'Updated' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.name).toBe('Updated');
  });

  it('should reject CL_ADMIN updating other tenant branch', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        data: { name: 'X' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-other' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw BRANCH_NAME_CONFLICT when name is taken', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());
    vi.mocked(branchRepo.findByName).mockResolvedValue(
      makeBranch({ id: 'branch-other', name: 'Taken' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        data: { name: 'Taken' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNameConflictError);
  });

  it('should throw BRANCH_NAME_CONFLICT when renaming to a name that differs only by case', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch({ name: 'Alpha' }));
    // findByName is case-insensitive and returns the existing "beta" branch
    vi.mocked(branchRepo.findByName).mockResolvedValue(
      makeBranch({ id: 'branch-other', name: 'beta' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        data: { name: 'BETA' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNameConflictError);
  });

  it('should allow renaming to same name with different casing (own branch)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch({ name: 'Main Branch' }));

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      data: { name: 'main branch' },
      actor: makeActor(),
    });

    // Case-insensitive comparison sees these as the same name, so no uniqueness check needed
    expect(result.name).toBe('main branch');
    expect(branchRepo.findByName).not.toHaveBeenCalled();
  });

  it('should update branch contactEmail', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(makeBranch());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      data: { contactEmail: 'pm@agency.com' },
      actor: makeActor(),
    });

    expect(result.contactEmail).toBe('pm@agency.com');
    expect(branchRepo.update).toHaveBeenCalledWith('branch-1', 'tenant-1', { contactEmail: 'pm@agency.com' });
  });

  it('should clear branch contactEmail (set to null)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(
      makeBranch({ contactEmail: 'old@agency.com' }),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      data: { contactEmail: null },
      actor: makeActor(),
    });

    expect(result.contactEmail).toBeNull();
    expect(branchRepo.update).toHaveBeenCalledWith('branch-1', 'tenant-1', { contactEmail: null });
  });

  it('should throw BRANCH_NOT_FOUND when branch does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(branchRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        branchId: 'nonexistent',
        data: { name: 'X' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(BranchNotFoundError);
  });
});
