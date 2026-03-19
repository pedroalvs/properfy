import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListPropertiesUseCase } from '../../../src/modules/property/application/use-cases/list-properties.use-case';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { AuthContext } from '@properfy/shared';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeProperty(
  overrides: Partial<ConstructorParameters<typeof PropertyEntity>[0]> = {},
): PropertyEntity {
  return new PropertyEntity({
    id: 'prop-1',
    tenantId: 'tenant-1',
    branchId: null,
    propertyCode: 'PROP-001',
    type: 'RESIDENTIAL',
    street: '123 Main St',
    addressLine2: null,
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'AU',
    lat: null,
    lng: null,
    geocodingStatus: 'PENDING',
    notes: null,
    rulesJson: {},
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

describe('ListPropertiesUseCase', () => {
  let propertyRepo: IPropertyRepository;
  let useCase: ListPropertiesUseCase;

  beforeEach(() => {
    propertyRepo = {
      findById: vi.fn(),
      findByPropertyCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new ListPropertiesUseCase(propertyRepo);
  });

  it('should return paginated list for AM with tenantId filter', async () => {
    const properties = [makeProperty(), makeProperty({ id: 'prop-2', propertyCode: 'PROP-002' })];
    vi.mocked(propertyRepo.findAll).mockResolvedValue(properties);
    vi.mocked(propertyRepo.count).mockResolvedValue(2);

    const result = await useCase.execute({
      filters: { tenantId: 'tenant-1' },
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(propertyRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
  });

  it('should use actor.tenantId for CL_ADMIN', async () => {
    vi.mocked(propertyRepo.findAll).mockResolvedValue([makeProperty()]);
    vi.mocked(propertyRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.data).toHaveLength(1);
    expect(propertyRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
    );
  });

  it('should return all properties for AM without tenantId', async () => {
    vi.mocked(propertyRepo.findAll).mockResolvedValue([makeProperty()]);
    vi.mocked(propertyRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    // tenantId is undefined — repository receives no tenant scope
    expect(propertyRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined }),
      expect.any(Object),
    );
  });

  it('should throw AUTH_FORBIDDEN for INSP role', async () => {
    await expect(
      useCase.execute({
        filters: { tenantId: 'tenant-1' },
        pagination: { page: 1, pageSize: 10, sortOrder: 'asc' },
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
