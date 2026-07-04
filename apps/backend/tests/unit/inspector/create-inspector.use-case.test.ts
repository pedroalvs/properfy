import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateInspectorUseCase } from '../../../src/modules/inspector/application/use-cases/create-inspector.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { inspectorResponseSchema } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { InspectorEmailConflictError } from '../../../src/modules/inspector/domain/inspector.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

function makeInspector(
  overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {},
): InspectorEntity {
  return new InspectorEntity({
    id: 'inspector-1',
    name: 'John Inspector',
    email: 'john@example.com',
    phone: '+61400000000',
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [{ serviceTypeId: 'service-1', certified: false }],
    blockedClientsJson: [],
    fullName: null,
    address: null,
    abn: null,
    dateOfBirth: null,
    insuranceFileKey: null,
    insuranceExpiresAt: null,
    policeCheckFileKey: null,
    policeCheckExpiresAt: null,
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

describe('CreateInspectorUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let userManagementRepo: IUserManagementRepository;
  let auditService: AuditService;
  let useCase: CreateInspectorUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      linkUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findByRegionId: vi.fn(),
    };
    userManagementRepo = {
      findById: vi.fn(),
      findByIdAndTenantId: vi.fn(),
      findByEmail: vi.fn(),
      findByTenantId: vi.fn(),
      countByTenantId: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      resetPassword: vi.fn(),
      revokeAllSessions: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new CreateInspectorUseCase(inspectorRepo, userManagementRepo, auditService, undefined, authorizationService);
  });

  it('should create inspector for AM with auto-created user record', async () => {
    vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);

    const result = await useCase.execute({
      name: 'John Inspector',
      email: 'john@example.com',
      phone: '+61400000000',
      actor: makeActor(),
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.name).toBe('John Inspector');
    expect(result.email).toBe('john@example.com');
    expect(result.id).toBeDefined();
    expect(result.userId).toBeDefined();
    expect(userManagementRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'INSP',
        email: 'john@example.com',
        tenantId: null,
        branchId: null,
        status: 'ACTIVE',
      }),
    );
    expect(inspectorRepo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inspector.created' }),
    );
  });

  it('returns an output that satisfies inspectorResponseSchema (HTTP response contract)', async () => {
    // Guards against field drift between the use case output and the route's
    // declared response schema. The Fastify zod serializerCompiler parses the
    // response body against this exact schema before sending the 201, so a
    // missing required field (e.g. updatedAt) throws AFTER the rows are
    // committed — the inspector persists but the client sees a 500.
    vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);

    const result = await useCase.execute({
      name: 'John Inspector',
      email: 'john@example.com',
      actor: makeActor(),
    });

    expect(() => inspectorResponseSchema.parse(result)).not.toThrow();
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('should create inspector for OP', async () => {
    vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(null);

    const result = await useCase.execute({
      name: 'Jane Inspector',
      email: 'jane@example.com',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.name).toBe('Jane Inspector');
    expect(inspectorRepo.save).toHaveBeenCalled();
  });

  it('should reject CL_ADMIN with AUTH_FORBIDDEN', async () => {
    await expect(
      useCase.execute({
        name: 'Inspector',
        email: 'test@example.com',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw INSPECTOR_EMAIL_CONFLICT when email already exists', async () => {
    vi.mocked(inspectorRepo.findByEmail).mockResolvedValue(makeInspector());

    await expect(
      useCase.execute({
        name: 'Another Inspector',
        email: 'john@example.com',
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorEmailConflictError);
  });
});
