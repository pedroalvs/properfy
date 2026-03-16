import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateInspectorUseCase } from '../../../src/modules/inspector/application/use-cases/create-inspector.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { InspectorEmailConflictError } from '../../../src/modules/inspector/domain/inspector.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

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
    regionsJson: ['region-1'],
    serviceTypesJson: ['service-1'],
    clientEligibilityJson: ['tenant-1'],
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
    ...overrides,
  };
}

describe('CreateInspectorUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let auditService: AuditService;
  let useCase: CreateInspectorUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new CreateInspectorUseCase(inspectorRepo, auditService);
  });

  it('should create inspector for AM', async () => {
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
    expect(inspectorRepo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inspector.created' }),
    );
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
