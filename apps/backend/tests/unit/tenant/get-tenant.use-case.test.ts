import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetTenantUseCase } from '../../../src/modules/tenant/application/use-cases/get-tenant.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { TenantNotFoundError } from '../../../src/modules/tenant/domain/tenant.errors';
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

describe('GetTenantUseCase', () => {
  let tenantRepo: ITenantRepository;
  let useCase: GetTenantUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new GetTenantUseCase(tenantRepo);
  });

  it('should return tenant data when actor is AM', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      actor: makeActor(),
    });

    expect(result.id).toBe('tenant-1');
    expect(result.name).toBe('Test Agency');
  });

  it('should return tenant data when actor is OP', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.id).toBe('tenant-1');
  });

  it('should return tenant data when CL_ADMIN accesses own tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.id).toBe('tenant-1');
  });

  it('should throw AUTH_FORBIDDEN when CL_ADMIN accesses other tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-other' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw TENANT_NOT_FOUND when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'nonexistent',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantNotFoundError);
  });

  it('should throw TENANT_NOT_FOUND when tenant is deleted', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ deletedAt: new Date() }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantNotFoundError);
  });
});
