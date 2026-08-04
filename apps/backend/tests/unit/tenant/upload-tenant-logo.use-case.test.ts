import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadTenantLogoUseCase, MAX_LOGO_BYTES, MAX_LOGO_DIMENSION_PX } from '../../../src/modules/tenant/application/use-cases/upload-tenant-logo.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { IBrandingStorageService } from '../../../src/modules/tenant/domain/branding-storage.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import {
  TenantNotFoundError,
  LogoFileInvalidError,
  LogoFileTooLargeError,
  LogoDimensionsExceededError,
} from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

/** Real 1×1 transparent PNG — passes both the magic-byte sniff and the decoder. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A PNG whose IHDR declares the given dimensions with no pixel data behind it.
 * file-type only checks the signature and image-size only reads the header, so
 * this stands in for a huge upload without megabytes of fixture.
 */
function pngWithDeclaredSize(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  const ihdr = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0d]),
    Buffer.from('IHDR'),
    ihdrData,
    Buffer.alloc(4), // CRC — not verified by image-size
  ]);
  return Buffer.concat([signature, ihdr]);
}

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
    settingsJson: { theme: 'light' },
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

describe('UploadTenantLogoUseCase', () => {
  let tenantRepo: ITenantRepository;
  let brandingStorage: IBrandingStorageService;
  let auditService: AuditService;
  let logger: Logger;
  let useCase: UploadTenantLogoUseCase;

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
      upload: vi.fn().mockResolvedValue(undefined),
      deleteObject: vi.fn().mockResolvedValue(undefined),
      getPublicUrl: vi.fn(
        (key: string) => `https://cdn.example.com/tenant-branding/${key}`,
      ),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
    useCase = new UploadTenantLogoUseCase(tenantRepo, brandingStorage, auditService, logger);
  });

  function run(overrides: { tenantId?: string; fileBuffer?: Buffer; actor?: AuthContext } = {}) {
    return useCase.execute({
      tenantId: 'tenant-1',
      fileBuffer: TINY_PNG,
      actor: makeActor(),
      ...overrides,
    });
  }

  // ── RBAC ──────────────────────────────────────────────────────────────────

  it('allows AM for any tenant', async () => {
    const result = await run();
    expect(result.logoUrl).toBe(
      'https://cdn.example.com/tenant-branding/tenants/tenant-1/branding/logo.png',
    );
  });

  it('allows OP for any tenant', async () => {
    const result = await run({ actor: makeActor({ role: 'OP', tenantId: 'other-tenant' }) });
    expect(result.logoUrl).toContain('/tenants/tenant-1/branding/logo.png');
  });

  it('allows CL_ADMIN for its own tenant', async () => {
    await expect(
      run({ actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }) }),
    ).resolves.toBeDefined();
  });

  it('rejects CL_ADMIN for another tenant', async () => {
    await expect(
      run({ actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-2' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(brandingStorage.upload).not.toHaveBeenCalled();
  });

  it.each(['CL_USER', 'INSP'] as const)('rejects %s even for its own tenant', async (role) => {
    await expect(
      run({ actor: makeActor({ role, tenantId: 'tenant-1' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  // ── Tenant lookup ─────────────────────────────────────────────────────────

  it('rejects an unknown tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);
    await expect(run()).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('rejects a soft-deleted tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ deletedAt: new Date() }));
    await expect(run()).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  // ── File validation ───────────────────────────────────────────────────────

  it('rejects a buffer that is not an image, before touching storage', async () => {
    await expect(run({ fileBuffer: Buffer.from('<svg>not really</svg>') })).rejects.toBeInstanceOf(
      LogoFileInvalidError,
    );
    expect(brandingStorage.upload).not.toHaveBeenCalled();
  });

  it('rejects a file over the size cap without sniffing it', async () => {
    await expect(run({ fileBuffer: Buffer.alloc(MAX_LOGO_BYTES + 1) })).rejects.toBeInstanceOf(
      LogoFileTooLargeError,
    );
  });

  it('rejects an image wider than the dimension cap', async () => {
    await expect(
      run({ fileBuffer: pngWithDeclaredSize(MAX_LOGO_DIMENSION_PX + 1, 10) }),
    ).rejects.toBeInstanceOf(LogoDimensionsExceededError);
  });

  it('rejects an image taller than the dimension cap', async () => {
    await expect(
      run({ fileBuffer: pngWithDeclaredSize(10, MAX_LOGO_DIMENSION_PX + 1) }),
    ).rejects.toBeInstanceOf(LogoDimensionsExceededError);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('uploads under a key derived from the DETECTED type, persists settings and audits', async () => {
    const result = await run();

    expect(brandingStorage.upload).toHaveBeenCalledWith(
      'tenants/tenant-1/branding/logo.png',
      TINY_PNG,
      'image/png',
    );
    expect(tenantRepo.update).toHaveBeenCalledWith('tenant-1', {
      settingsJson: expect.objectContaining({
        theme: 'light',
        logoUrl: result.logoUrl,
        logoStorageKey: 'tenants/tenant-1/branding/logo.png',
      }),
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.logo_updated',
        entityId: 'tenant-1',
        tenantId: 'tenant-1',
        before: { logoUrl: null },
        after: {
          logoUrl: result.logoUrl,
          logoStorageKey: 'tenants/tenant-1/branding/logo.png',
        },
      }),
    );
  });

  it('does not persist settings when the storage upload fails', async () => {
    vi.mocked(brandingStorage.upload).mockRejectedValue(new Error('s3 down'));
    await expect(run()).rejects.toThrow('s3 down');
    expect(tenantRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  // ── Old-file cleanup ──────────────────────────────────────────────────────

  it('deletes the previous object when the extension changed', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({
        settingsJson: {
          logoUrl: 'https://cdn.example.com/tenant-branding/tenants/tenant-1/branding/logo.webp',
          logoStorageKey: 'tenants/tenant-1/branding/logo.webp',
        },
      }),
    );
    await run();
    expect(brandingStorage.deleteObject).toHaveBeenCalledWith(
      'tenants/tenant-1/branding/logo.webp',
    );
  });

  it('skips the delete when the new upload reuses the same key', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ settingsJson: { logoStorageKey: 'tenants/tenant-1/branding/logo.png' } }),
    );
    await run();
    expect(brandingStorage.deleteObject).not.toHaveBeenCalled();
  });

  it('still succeeds when deleting the previous object fails', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ settingsJson: { logoStorageKey: 'tenants/tenant-1/branding/logo.webp' } }),
    );
    vi.mocked(brandingStorage.deleteObject).mockRejectedValue(new Error('s3 hiccup'));

    const result = await run();

    expect(result.logoUrl).toContain('/logo.png');
    expect(tenantRepo.update).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
