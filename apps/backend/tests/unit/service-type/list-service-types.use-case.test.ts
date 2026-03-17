import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListServiceTypesUseCase } from '../../../src/modules/service-type/application/use-cases/list-service-types.use-case';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { AuthContext } from '@properfy/shared';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';

function makeServiceType(
  overrides: Partial<ConstructorParameters<typeof ServiceTypeEntity>[0]> = {},
): ServiceTypeEntity {
  return new ServiceTypeEntity({
    id: 'st-1',
    code: 'ROUTINE',
    name: 'Routine Inspection',
    flowType: 'ROUTINE',
    requiresTenantConfirmation: true,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
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

describe('ListServiceTypesUseCase', () => {
  let serviceTypeRepo: IServiceTypeRepository;
  let useCase: ListServiceTypesUseCase;

  beforeEach(() => {
    serviceTypeRepo = {
      findById: vi.fn(),
      findByCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new ListServiceTypesUseCase(serviceTypeRepo);
  });

  it('should return paginated list', async () => {
    const items = [
      makeServiceType({ id: 'st-1', code: 'ROUTINE' }),
      makeServiceType({ id: 'st-2', code: 'INGOING', name: 'Ingoing Inspection' }),
    ];
    vi.mocked(serviceTypeRepo.findAll).mockResolvedValue(items);
    vi.mocked(serviceTypeRepo.count).mockResolvedValue(2);

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it('should apply filters', async () => {
    vi.mocked(serviceTypeRepo.findAll).mockResolvedValue([]);
    vi.mocked(serviceTypeRepo.count).mockResolvedValue(0);

    await useCase.execute({
      filters: { status: 'ACTIVE', search: 'routine' },
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor(),
    });

    expect(serviceTypeRepo.findAll).toHaveBeenCalledWith(
      { status: 'ACTIVE', search: 'routine' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );
    expect(serviceTypeRepo.count).toHaveBeenCalledWith({
      status: 'ACTIVE',
      search: 'routine',
    });
  });
});
