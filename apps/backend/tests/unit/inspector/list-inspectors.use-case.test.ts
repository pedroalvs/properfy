import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListInspectorsUseCase } from '../../../src/modules/inspector/application/use-cases/list-inspectors.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
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

describe('ListInspectorsUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let useCase: ListInspectorsUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findAll: vi.fn().mockResolvedValue([makeInspector()]),
      count: vi.fn().mockResolvedValue(1),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new ListInspectorsUseCase(inspectorRepo);
  });

  it('should return all for AM', async () => {
    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it('should filter by eligibility for CL_ADMIN', async () => {
    await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(inspectorRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
    );
    expect(inspectorRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });

  it('should reject INSP with AUTH_FORBIDDEN', async () => {
    await expect(
      useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
