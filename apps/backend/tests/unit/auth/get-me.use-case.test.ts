import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetMeUseCase } from '../../../src/modules/auth/application/use-cases/get-me.use-case';
import type { IUserRepository } from '../../../src/modules/auth/domain/user.repository';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IStorageService } from '../../../src/modules/inspector-execution/domain/storage.service';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { UnauthorizedError } from '../../../src/shared/domain/errors';

function makeUser(
  overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {},
): UserEntity {
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'CL_ADMIN',
    name: 'Test User',
    email: 'test@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: '$2a$12$dummy',
    totpSecret: null,
    totpEnabled: false,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    ...overrides,
  });
}

function makeInspector(
  overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {},
): InspectorEntity {
  return new InspectorEntity({
    id: 'inspector-1',
    userId: 'user-insp-1',
    name: 'Inspector One',
    email: 'inspector@example.com',
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [],
    clientEligibilityJson: [],
    blockedClientsJson: [],
    fullName: null,
    address: null,
    abn: null,
    dateOfBirth: null,
    insuranceFileKey: null,
    insuranceExpiresAt: null,
    policeCheckFileKey: null,
    policeCheckExpiresAt: null,
    insuranceMetaJson: null,
    policeCheckMetaJson: null,
    photoStorageKey: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    ...overrides,
  });
}

describe('GetMeUseCase', () => {
  let userRepo: IUserRepository;
  let inspectorRepo: IInspectorRepository;
  let storageService: IStorageService;
  let tenantRepo: ITenantRepository;
  let useCase: GetMeUseCase;

  function makeTenant(clUserPermissions: string[]): TenantEntity {
    return new TenantEntity({
      id: 'tenant-1', name: 'Acme', legalName: 'Acme Pty', timezone: 'Australia/Sydney',
      currency: 'AUD', settingsJson: { clUserPermissions }, status: 'ACTIVE',
      createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-01'), deletedAt: null,
    });
  }

  beforeEach(() => {
    userRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      updateLoginSuccess: vi.fn(),
      updateFailedLogin: vi.fn(),
      updatePassword: vi.fn(),
    };
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByUserId: vi.fn().mockResolvedValue(null),
      linkUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findByRegionId: vi.fn(),
    } as unknown as IInspectorRepository;
    storageService = {
      createSignedUploadUrl: vi.fn(),
      createSignedDownloadUrl: vi.fn(),
      headObject: vi.fn(),
      deleteObject: vi.fn(),
    } as unknown as IStorageService;
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    } as unknown as ITenantRepository;
    useCase = new GetMeUseCase(userRepo, inspectorRepo, storageService, tenantRepo);
  });

  it('should return user profile for active user', async () => {
    const lastLogin = new Date('2024-06-15');
    const user = makeUser({ lastLoginAt: lastLogin });
    vi.mocked(userRepo.findById).mockResolvedValue(user);

    const result = await useCase.execute('user-1');

    expect(userRepo.findById).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      phone: null,
      role: 'CL_ADMIN',
      status: 'ACTIVE',
      tenantId: 'tenant-1',
      branchId: null,
      totpEnabled: false,
      lastLoginAt: lastLogin.toISOString(),
      createdAt: new Date('2024-01-01').toISOString(),
      inspectorId: null,
      inspectorPhotoUrl: null,
    });
  });

  it('should throw UnauthorizedError when user not found', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute('non-existent')).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('should throw UnauthorizedError when user is deleted', async () => {
    const user = makeUser({ deletedAt: new Date('2024-03-01') });
    vi.mocked(userRepo.findById).mockResolvedValue(user);

    await expect(useCase.execute('user-1')).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('should throw UnauthorizedError when user is inactive', async () => {
    const user = makeUser({ status: 'INACTIVE' });
    vi.mocked(userRepo.findById).mockResolvedValue(user);

    await expect(useCase.execute('user-1')).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('should return inspectorId and null photoUrl for INSP user without photo', async () => {
    const user = makeUser({ id: 'user-insp-1', role: 'INSP', tenantId: null });
    const inspector = makeInspector({ photoStorageKey: null });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(inspectorRepo.findByUserId).mockResolvedValue(inspector);

    const result = await useCase.execute('user-insp-1');

    expect(inspectorRepo.findByUserId).toHaveBeenCalledWith('user-insp-1');
    expect(storageService.createSignedDownloadUrl).not.toHaveBeenCalled();
    expect(result.inspectorId).toBe('inspector-1');
    expect(result.inspectorPhotoUrl).toBeNull();
  });

  it('should return inspectorId and signed photoUrl for INSP user with photo', async () => {
    const user = makeUser({ id: 'user-insp-1', role: 'INSP', tenantId: null });
    const inspector = makeInspector({ photoStorageKey: 'inspectors/inspector-1/avatar.jpg' });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(inspectorRepo.findByUserId).mockResolvedValue(inspector);
    vi.mocked(storageService.createSignedDownloadUrl).mockResolvedValue(
      'https://storage.example.com/inspector-avatars/inspectors/inspector-1/avatar.jpg?sig=abc',
    );

    const result = await useCase.execute('user-insp-1');

    expect(storageService.createSignedDownloadUrl).toHaveBeenCalledWith(
      'inspector-avatars',
      'inspectors/inspector-1/avatar.jpg',
      900,
    );
    expect(result.inspectorId).toBe('inspector-1');
    expect(result.inspectorPhotoUrl).toBe(
      'https://storage.example.com/inspector-avatars/inspectors/inspector-1/avatar.jpg?sig=abc',
    );
  });

  it('should return null inspectorId when INSP user has no linked inspector', async () => {
    const user = makeUser({ id: 'user-insp-1', role: 'INSP', tenantId: null });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(inspectorRepo.findByUserId).mockResolvedValue(null);

    const result = await useCase.execute('user-insp-1');

    expect(result.inspectorId).toBeNull();
    expect(result.inspectorPhotoUrl).toBeNull();
  });

  it('should not query inspector repo for non-INSP roles', async () => {
    const user = makeUser({ role: 'OP', tenantId: null });
    vi.mocked(userRepo.findById).mockResolvedValue(user);

    await useCase.execute('user-1');

    expect(inspectorRepo.findByUserId).not.toHaveBeenCalled();
  });

  // 031: expose CL_USER permission flags so the web can mirror server-side gating.
  it('should return clUserPermissions from tenant settings for a CL_USER', async () => {
    const user = makeUser({ role: 'CL_USER', tenantId: 'tenant-1' });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant(['view_financials', 'create_appointments']));

    const result = await useCase.execute('user-1');

    expect(tenantRepo.findById).toHaveBeenCalledWith('tenant-1');
    expect(result.clUserPermissions).toEqual(['view_financials', 'create_appointments']);
  });

  it('should default clUserPermissions to [] for a CL_USER whose tenant has none', async () => {
    const user = makeUser({ role: 'CL_USER', tenantId: 'tenant-1' });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant([]));

    const result = await useCase.execute('user-1');

    expect(result.clUserPermissions).toEqual([]);
  });

  it('should not resolve clUserPermissions for non-CL_USER roles', async () => {
    const user = makeUser({ role: 'CL_ADMIN', tenantId: 'tenant-1' });
    vi.mocked(userRepo.findById).mockResolvedValue(user);

    const result = await useCase.execute('user-1');

    expect(tenantRepo.findById).not.toHaveBeenCalled();
    expect(result.clUserPermissions).toBeUndefined();
  });
});
