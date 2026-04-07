import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivateTenantUseCase } from '../../../src/modules/tenant/application/use-cases/activate-tenant.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import {
  TenantNotFoundError,
  TenantAlreadyActiveError,
} from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeTenant(
  overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {},
): TenantEntity {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'PENDING',
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

describe('ActivateTenantUseCase', () => {
  let tenantRepo: ITenantRepository;
  let auditService: AuditService;
  let useCase: ActivateTenantUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new ActivateTenantUseCase(tenantRepo, auditService);
  });

  it('should activate a PENDING tenant when actor is AM', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ status: 'PENDING' }));

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      actor: makeActor(),
    });

    expect(tenantRepo.update).toHaveBeenCalledWith('tenant-1', { status: 'ACTIVE' });
    expect(result.status).toBe('ACTIVE');
    expect(result.id).toBe('tenant-1');
    expect(result.activatedAt).toBeInstanceOf(Date);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.activated',
        before: { status: 'PENDING' },
        after: { status: 'ACTIVE' },
      }),
    );
  });

  it('should activate an INACTIVE tenant when actor is AM', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ status: 'INACTIVE' }));

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      actor: makeActor(),
    });

    expect(tenantRepo.update).toHaveBeenCalledWith('tenant-1', { status: 'ACTIVE' });
    expect(result.status).toBe('ACTIVE');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.activated',
        before: { status: 'INACTIVE' },
        after: { status: 'ACTIVE' },
      }),
    );
  });

  it('should throw TenantAlreadyActiveError when tenant is already ACTIVE', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ status: 'ACTIVE' }));

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantAlreadyActiveError);
  });

  it('should reject non-AM roles with ForbiddenError', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw TenantNotFoundError when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'nonexistent',
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantNotFoundError);
  });

  it('should persist optional reason in audit log', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ status: 'PENDING' }));

    await useCase.execute({
      tenantId: 'tenant-1',
      reason: 'Onboarding complete',
      actor: makeActor(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.activated',
        reason: 'Onboarding complete',
      }),
    );
  });

  it('should not include reason in audit log when not provided', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ status: 'PENDING' }));

    await useCase.execute({
      tenantId: 'tenant-1',
      actor: makeActor(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.activated',
        reason: undefined,
      }),
    );
  });
});
