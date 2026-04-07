import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmLogoUploadUseCase } from '../../../src/modules/tenant/application/use-cases/confirm-logo-upload.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBrandingStorageService } from '../../../src/modules/tenant/domain/branding-storage.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
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
    settingsJson: { primaryColor: '#ff0000' },
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('ConfirmLogoUploadUseCase', () => {
  let tenantRepo: ITenantRepository;
  let brandingStorage: IBrandingStorageService;
  let auditService: AuditService;
  let useCase: ConfirmLogoUploadUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn().mockResolvedValue(makeTenant()),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    brandingStorage = {
      createSignedUploadUrl: vi.fn(),
      getPublicUrl: vi.fn().mockReturnValue(
        'https://storage.example.com/tenant-branding/tenants/tenant-1/branding/logo.png',
      ),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new ConfirmLogoUploadUseCase(tenantRepo, brandingStorage, auditService);
  });

  it('should update settings with logoUrl and audit the change', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      storageKey: 'tenants/tenant-1/branding/logo.png',
      actor: makeActor(),
    });

    expect(result.logoUrl).toBe(
      'https://storage.example.com/tenant-branding/tenants/tenant-1/branding/logo.png',
    );

    // Verify tenant repo was updated with merged settings
    expect(tenantRepo.update).toHaveBeenCalledWith('tenant-1', {
      settingsJson: {
        primaryColor: '#ff0000',
        logoUrl: 'https://storage.example.com/tenant-branding/tenants/tenant-1/branding/logo.png',
      },
    });

    // Verify audit was logged
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.logo_updated',
        actorType: 'USER',
        actorId: 'user-1',
        entityType: 'Tenant',
        entityId: 'tenant-1',
        tenantId: 'tenant-1',
        before: { logoUrl: null },
        after: {
          logoUrl: 'https://storage.example.com/tenant-branding/tenants/tenant-1/branding/logo.png',
        },
      }),
    );
  });

  it('should allow AM to confirm for any tenant', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      storageKey: 'tenants/tenant-1/branding/logo.png',
      actor: makeActor({ role: 'AM', tenantId: null }),
    });

    expect(result.logoUrl).toBeDefined();
  });

  it('should allow CL_ADMIN to confirm for own tenant', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      storageKey: 'tenants/tenant-1/branding/logo.png',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.logoUrl).toBeDefined();
  });

  it('should reject CL_ADMIN for a different tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        storageKey: 'tenants/tenant-1/branding/logo.png',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-other' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should reject non-AM and non-CL_ADMIN roles', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        storageKey: 'tenants/tenant-1/branding/logo.png',
        actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should throw TenantNotFoundError when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'nonexistent',
        storageKey: 'tenants/nonexistent/branding/logo.png',
        actor: makeActor(),
      }),
    ).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('should preserve existing settings when adding logoUrl', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({
        settingsJson: {
          primaryColor: '#ff0000',
          notificationFromName: 'Test',
          nested: { deep: true },
        },
      }),
    );

    await useCase.execute({
      tenantId: 'tenant-1',
      storageKey: 'tenants/tenant-1/branding/logo.png',
      actor: makeActor(),
    });

    expect(tenantRepo.update).toHaveBeenCalledWith('tenant-1', {
      settingsJson: expect.objectContaining({
        primaryColor: '#ff0000',
        notificationFromName: 'Test',
        nested: { deep: true },
        logoUrl: expect.any(String),
      }),
    });
  });

  it('should overwrite existing logoUrl', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({
        settingsJson: { logoUrl: 'https://old-url.com/logo.png' },
      }),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      storageKey: 'tenants/tenant-1/branding/logo.png',
      actor: makeActor(),
    });

    expect(result.logoUrl).toBe(
      'https://storage.example.com/tenant-branding/tenants/tenant-1/branding/logo.png',
    );

    // Audit should capture previous URL
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { logoUrl: 'https://old-url.com/logo.png' },
      }),
    );
  });
});
