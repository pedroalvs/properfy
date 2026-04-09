import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListTenantsUseCase } from '../../../src/modules/tenant/application/use-cases/list-tenants.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { IBranchRepository } from '../../../src/modules/tenant/domain/branch.repository';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

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

describe('ListTenantsUseCase', () => {
  let tenantRepo: ITenantRepository;
  let branchRepo: IBranchRepository;
  let useCase: ListTenantsUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findAll: vi.fn().mockResolvedValue([makeTenant()]),
      count: vi.fn().mockResolvedValue(1),
      save: vi.fn(),
      update: vi.fn(),
    };
    branchRepo = {
      findById: vi.fn(),
      findByName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      countByTenantIds: vi.fn().mockResolvedValue({ 'tenant-1': 2 }),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new ListTenantsUseCase(tenantRepo, branchRepo, new AuthorizationService({ log: vi.fn() } as any));
  });

  it('should return paginated list when actor is AM', async () => {
    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.data[0].branchCount).toBe(2);
  });

  it('should return paginated list when actor is OP', async () => {
    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.data).toHaveLength(1);
  });

  it('should reject CL_ADMIN with AUTH_FORBIDDEN', async () => {
    await expect(
      useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
