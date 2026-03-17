import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetInspectorUseCase } from '../../../src/modules/inspector/application/use-cases/get-inspector.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { InspectorNotFoundError } from '../../../src/modules/inspector/domain/inspector.errors';
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
    inspectorId: null,
    ...overrides,
  };
}

describe('GetInspectorUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let useCase: GetInspectorUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new GetInspectorUseCase(inspectorRepo);
  });

  it('should return inspector for AM', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      actor: makeActor(),
    });

    expect(result.id).toBe('inspector-1');
    expect(result.name).toBe('John Inspector');
  });

  it('should return eligible inspector for CL_ADMIN', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ clientEligibilityJson: ['tenant-1'] }),
    );

    const result = await useCase.execute({
      inspectorId: 'inspector-1',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.id).toBe('inspector-1');
  });

  it('should throw INSPECTOR_NOT_FOUND for CL_ADMIN when not eligible', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ clientEligibilityJson: ['tenant-2'] }),
    );

    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(InspectorNotFoundError);
  });

  it('should throw INSPECTOR_NOT_FOUND when not found', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: 'inspector-999',
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorNotFoundError);
  });

  it('should reject INSP with AUTH_FORBIDDEN', async () => {
    await expect(
      useCase.execute({
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
