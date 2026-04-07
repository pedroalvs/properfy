import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerateLogoUploadUrlUseCase } from '../../../src/modules/tenant/application/use-cases/generate-logo-upload-url.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBrandingStorageService } from '../../../src/modules/tenant/domain/branding-storage.service';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { TenantNotFoundError } from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';

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
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('GenerateLogoUploadUrlUseCase', () => {
  let tenantRepo: ITenantRepository;
  let brandingStorage: IBrandingStorageService;
  let useCase: GenerateLogoUploadUrlUseCase;

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
      createSignedUploadUrl: vi.fn().mockResolvedValue({
        url: 'https://storage.example.com/presigned-url',
        storageKey: 'tenants/tenant-1/branding/logo.png',
      }),
      getPublicUrl: vi.fn(),
    };
    useCase = new GenerateLogoUploadUrlUseCase(tenantRepo, brandingStorage);
  });

  it('should allow AM to generate upload URL for any tenant', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      contentType: 'image/png',
      actor: makeActor({ role: 'AM', tenantId: null }),
    });

    expect(result.uploadUrl).toBe('https://storage.example.com/presigned-url');
    expect(result.storageKey).toBe('tenants/tenant-1/branding/logo.png');
    expect(result.expiresIn).toBe(900);
    expect(brandingStorage.createSignedUploadUrl).toHaveBeenCalledWith(
      'tenants/tenant-1/branding/logo.png',
      'image/png',
      900,
    );
  });

  it('should allow CL_ADMIN to generate upload URL for own tenant', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      contentType: 'image/jpeg',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.uploadUrl).toBe('https://storage.example.com/presigned-url');
    expect(result.storageKey).toBe('tenants/tenant-1/branding/logo.jpg');
    expect(result.expiresIn).toBe(900);
  });

  it('should reject CL_ADMIN for a different tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        contentType: 'image/png',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-other' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should reject non-AM and non-CL_ADMIN roles', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        contentType: 'image/png',
        actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        contentType: 'image/png',
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should reject invalid content type', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        contentType: 'application/pdf',
        actor: makeActor(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('should return correct storage key and upload URL', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      contentType: 'image/webp',
      actor: makeActor(),
    });

    expect(result.storageKey).toBe('tenants/tenant-1/branding/logo.webp');
    expect(result.uploadUrl).toBeDefined();
    expect(result.expiresIn).toBe(900);
  });

  it('should handle SVG content type', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      contentType: 'image/svg+xml',
      actor: makeActor(),
    });

    expect(result.storageKey).toBe('tenants/tenant-1/branding/logo.svg');
  });

  it('should throw TenantNotFoundError when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'nonexistent',
        contentType: 'image/png',
        actor: makeActor(),
      }),
    ).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('should throw TenantNotFoundError when tenant is deleted', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ deletedAt: new Date() }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        contentType: 'image/png',
        actor: makeActor(),
      }),
    ).rejects.toBeInstanceOf(TenantNotFoundError);
  });
});
