import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteTenantLogoUseCase } from '../../../src/modules/tenant/application/use-cases/delete-tenant-logo.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBrandingStorageService } from '../../../src/modules/tenant/domain/branding-storage.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import {
  TenantNotFoundError,
  TenantLogoNotFoundError,
} from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const LOGO_SETTINGS = {
  theme: 'light',
  logoUrl: 'https://cdn.example.com/tenant-branding/tenants/tenant-1/branding/logo.png',
  logoStorageKey: 'tenants/tenant-1/branding/logo.png',
};

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
    settingsJson: { ...LOGO_SETTINGS },
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

describe('DeleteTenantLogoUseCase', () => {
  let tenantRepo: ITenantRepository;
  let brandingStorage: IBrandingStorageService;
  let auditService: AuditService;
  let logger: Logger;
  let useCase: DeleteTenantLogoUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn().mockResolvedValue(makeTenant()),
      findByLegalName: vi.fn(),
      findByAppointmentCodePrefix: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    brandingStorage = {
      upload: vi.fn(),
      deleteObject: vi.fn().mockResolvedValue(undefined),
      getPublicUrl: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
    useCase = new DeleteTenantLogoUseCase(tenantRepo, brandingStorage, auditService, logger);
  });

  function run(overrides: { tenantId?: string; actor?: AuthContext } = {}) {
    return useCase.execute({ tenantId: 'tenant-1', actor: makeActor(), ...overrides });
  }

  it('allows AM and OP for any tenant, CL_ADMIN for its own', async () => {
    await expect(run()).resolves.toBeUndefined();
    await expect(run({ actor: makeActor({ role: 'OP', tenantId: 'other' }) })).resolves.toBeUndefined();
    await expect(
      run({ actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }) }),
    ).resolves.toBeUndefined();
  });

  it('rejects CL_ADMIN for another tenant and non-admin roles', async () => {
    await expect(
      run({ actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-2' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      run({ actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(tenantRepo.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown or deleted tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);
    await expect(run()).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('404s when the tenant has no logo', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ settingsJson: {} }));
    await expect(run()).rejects.toBeInstanceOf(TenantLogoNotFoundError);
    expect(tenantRepo.update).not.toHaveBeenCalled();
  });

  it('removes both logo keys from settings, keeps the rest, then deletes the object', async () => {
    await run();

    const [, data] = vi.mocked(tenantRepo.update).mock.calls[0]!;
    expect(data.settingsJson).toEqual({ theme: 'light' });
    expect(data.settingsJson).not.toHaveProperty('logoUrl');
    expect(data.settingsJson).not.toHaveProperty('logoStorageKey');
    expect(brandingStorage.deleteObject).toHaveBeenCalledWith(
      'tenants/tenant-1/branding/logo.png',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.logo_deleted',
        entityId: 'tenant-1',
        tenantId: 'tenant-1',
        before: { logoUrl: LOGO_SETTINGS.logoUrl },
        after: { logoUrl: null },
      }),
    );
  });

  it('persists BEFORE deleting so a storage failure cannot leave emails pointing at a dead file', async () => {
    vi.mocked(brandingStorage.deleteObject).mockRejectedValue(new Error('s3 hiccup'));

    await expect(run()).resolves.toBeUndefined();

    expect(tenantRepo.update).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
