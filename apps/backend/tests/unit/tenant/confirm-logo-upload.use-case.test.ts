import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmLogoUploadUseCase } from '../../../src/modules/tenant/application/use-cases/confirm-logo-upload.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBrandingStorageService } from '../../../src/modules/tenant/domain/branding-storage.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import {
  TenantNotFoundError,
  LogoStorageKeyInvalidError,
  LogoUploadObjectNotFoundError,
} from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const TENANT_UUID = '00000000-0000-0000-0000-000000000001';
const STORAGE_KEY = `tenants/${TENANT_UUID}/branding/logo.png`;
const LOGO_PUBLIC_URL = `https://storage.example.com/tenant-branding/${STORAGE_KEY}`;

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
      getPublicUrl: vi.fn().mockReturnValue(LOGO_PUBLIC_URL),
      headObject: vi.fn().mockResolvedValue({ exists: true, sizeBytes: 2048 }),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new ConfirmLogoUploadUseCase(tenantRepo, brandingStorage, auditService);
  });

  it('should update settings with logoUrl, logoStorageKey and audit the change', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      storageKey: STORAGE_KEY,
      actor: makeActor(),
    });

    expect(result.logoUrl).toBe(LOGO_PUBLIC_URL);

    expect(tenantRepo.update).toHaveBeenCalledWith('tenant-1', {
      settingsJson: {
        primaryColor: '#ff0000',
        logoUrl: LOGO_PUBLIC_URL,
        logoStorageKey: STORAGE_KEY,
      },
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.logo_updated',
        actorType: 'USER',
        actorId: 'user-1',
        entityType: 'Tenant',
        entityId: 'tenant-1',
        tenantId: 'tenant-1',
        before: { logoUrl: null },
        after: { logoUrl: LOGO_PUBLIC_URL, logoStorageKey: STORAGE_KEY },
      }),
    );
  });

  it('should verify object exists via headObject before confirming', async () => {
    await useCase.execute({
      tenantId: 'tenant-1',
      storageKey: STORAGE_KEY,
      actor: makeActor(),
    });

    expect(brandingStorage.headObject).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('should throw LogoUploadObjectNotFoundError when object not in storage', async () => {
    vi.mocked(brandingStorage.headObject).mockResolvedValue({ exists: false });

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        storageKey: STORAGE_KEY,
        actor: makeActor(),
      }),
    ).rejects.toBeInstanceOf(LogoUploadObjectNotFoundError);

    expect(tenantRepo.update).not.toHaveBeenCalled();
  });

  it('should throw LogoStorageKeyInvalidError for non-UUID key', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        storageKey: 'tenants/tenant-1/branding/logo.png',
        actor: makeActor(),
      }),
    ).rejects.toBeInstanceOf(LogoStorageKeyInvalidError);
  });

  it('should throw LogoStorageKeyInvalidError for unsupported extension', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        storageKey: `tenants/${TENANT_UUID}/branding/logo.gif`,
        actor: makeActor(),
      }),
    ).rejects.toBeInstanceOf(LogoStorageKeyInvalidError);
  });

  it('should allow AM to confirm for any tenant', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      storageKey: STORAGE_KEY,
      actor: makeActor({ role: 'AM', tenantId: null }),
    });

    expect(result.logoUrl).toBeDefined();
  });

  it('should allow CL_ADMIN to confirm for own tenant', async () => {
    const result = await useCase.execute({
      tenantId: 'tenant-1',
      storageKey: STORAGE_KEY,
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.logoUrl).toBeDefined();
  });

  it('should reject CL_ADMIN for a different tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        storageKey: STORAGE_KEY,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-other' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should reject non-AM and non-CL_ADMIN roles', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        storageKey: STORAGE_KEY,
        actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should throw TenantNotFoundError when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'tenant-nonexistent',
        storageKey: STORAGE_KEY,
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
      storageKey: STORAGE_KEY,
      actor: makeActor(),
    });

    expect(tenantRepo.update).toHaveBeenCalledWith('tenant-1', {
      settingsJson: expect.objectContaining({
        primaryColor: '#ff0000',
        notificationFromName: 'Test',
        nested: { deep: true },
        logoUrl: expect.any(String),
        logoStorageKey: STORAGE_KEY,
      }),
    });
  });

  it('should overwrite existing logoUrl and logoStorageKey', async () => {
    const oldKey = `tenants/${TENANT_UUID}/branding/logo.jpg`;
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({
        settingsJson: { logoUrl: 'https://old-url.com/logo.png', logoStorageKey: oldKey },
      }),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      storageKey: STORAGE_KEY,
      actor: makeActor(),
    });

    expect(result.logoUrl).toBe(LOGO_PUBLIC_URL);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { logoUrl: 'https://old-url.com/logo.png' },
        after: { logoUrl: LOGO_PUBLIC_URL, logoStorageKey: STORAGE_KEY },
      }),
    );
  });
});

describe('tenant logo upload error codes', () => {
  it('LogoStorageKeyInvalidError carries LOGO_STORAGE_KEY_INVALID with status 400', () => {
    const err = new LogoStorageKeyInvalidError();
    expect(err.code).toBe('LOGO_STORAGE_KEY_INVALID');
    expect(err.statusCode).toBe(400);
  });

  it('LogoUploadObjectNotFoundError carries LOGO_UPLOAD_OBJECT_NOT_FOUND with status 400', () => {
    const err = new LogoUploadObjectNotFoundError();
    expect(err.code).toBe('LOGO_UPLOAD_OBJECT_NOT_FOUND');
    expect(err.statusCode).toBe(400);
  });
});
