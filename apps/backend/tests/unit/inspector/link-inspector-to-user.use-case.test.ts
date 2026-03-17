import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkInspectorToUserUseCase } from '../../../src/modules/inspector/application/use-cases/link-inspector-to-user.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { ForbiddenError, NotFoundError, ConflictError } from '../../../src/shared/domain/errors';

function makeInspector(
  overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {},
): InspectorEntity {
  return new InspectorEntity({
    id: 'inspector-1',
    userId: null,
    name: 'John Inspector',
    email: 'john@example.com',
    phone: '+61400000000',
    status: 'ACTIVE',
    paymentSettingsJson: {},
    regionsJson: ['region-1'],
    serviceTypesJson: ['service-1'],
    clientEligibilityJson: ['tenant-1'],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeUser(
  overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {},
): UserEntity {
  return new UserEntity({
    id: 'user-insp-1',
    tenantId: null,
    branchId: null,
    role: 'INSP',
    name: 'Inspector User',
    email: 'inspector-user@example.com',
    phone: '+61400000001',
    status: 'ACTIVE',
    passwordHash: 'hashed',
    totpSecret: null,
    totpEnabled: false,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
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

describe('LinkInspectorToUserUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let userRepo: IUserManagementRepository;
  let auditService: AuditService;
  let useCase: LinkInspectorToUserUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      linkUserId: vi.fn(),
    };
    userRepo = {
      findById: vi.fn(),
      findByIdAndTenantId: vi.fn(),
      findByEmail: vi.fn(),
      findByTenantId: vi.fn(),
      countByTenantId: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      revokeAllSessions: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new LinkInspectorToUserUseCase(inspectorRepo, userRepo, auditService);
  });

  it('should link inspector to INSP user for AM actor', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());
    vi.mocked(inspectorRepo.findByUserId).mockResolvedValue(null);

    await useCase.execute({
      inspectorId: 'inspector-1',
      userId: 'user-insp-1',
      actor: makeActor(),
    });

    expect(inspectorRepo.linkUserId).toHaveBeenCalledWith('inspector-1', 'user-insp-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector.user_linked',
        entityType: 'Inspector',
        entityId: 'inspector-1',
        after: { inspectorId: 'inspector-1', userId: 'user-insp-1' },
      }),
    );
  });

  it('should link inspector to INSP user for OP actor', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());
    vi.mocked(inspectorRepo.findByUserId).mockResolvedValue(null);

    await useCase.execute({
      inspectorId: 'inspector-1',
      userId: 'user-insp-1',
      actor: makeActor({ role: 'OP', userId: 'user-op-1' }),
    });

    expect(inspectorRepo.linkUserId).toHaveBeenCalledWith('inspector-1', 'user-insp-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inspector.user_linked' }),
    );
  });

  it('should throw ForbiddenError for CL_ADMIN actor', async () => {
    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        userId: 'user-insp-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw NotFoundError when inspector is not found', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: 'inspector-999',
        userId: 'user-insp-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('should throw ConflictError when inspector is already linked', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ userId: 'existing-user-id' }),
    );

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        userId: 'user-insp-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('should throw NotFoundError when user is not found', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(userRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        userId: 'user-999',
        actor: makeActor(),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('should throw ConflictError when user does not have INSP role', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser({ role: 'CL_ADMIN' }));

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        userId: 'user-insp-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('should throw ConflictError when user is already linked to another inspector', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());
    vi.mocked(inspectorRepo.findByUserId).mockResolvedValue(
      makeInspector({ id: 'inspector-2', userId: 'user-insp-1' }),
    );

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        userId: 'user-insp-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ConflictError);
  });
});
