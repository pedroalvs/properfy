import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetPropertySummaryUseCase } from '../../../src/modules/property/application/use-cases/get-property-summary.use-case';
import type { IPropertyRepository } from '../../../src/modules/property/domain/property.repository';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';

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

describe('GetPropertySummaryUseCase', () => {
  let propertyRepo: Pick<IPropertyRepository, 'countByType'>;
  let useCase: GetPropertySummaryUseCase;

  beforeEach(() => {
    propertyRepo = {
      countByType: vi.fn().mockResolvedValue({ HOUSE: 4, APARTMENT: 6, COMMERCIAL: 2 }),
    };
    useCase = new GetPropertySummaryUseCase(propertyRepo as IPropertyRepository);
  });

  it('should return total, house and apartment counts (total includes other types)', async () => {
    const result = await useCase.execute({ filters: {}, actor: makeActor() });

    expect(result).toEqual({ totalCount: 12, houseCount: 4, apartmentCount: 6 });
  });

  it('should return zeros when there are no properties', async () => {
    vi.mocked(propertyRepo.countByType).mockResolvedValue({});

    const result = await useCase.execute({ filters: {}, actor: makeActor() });

    expect(result).toEqual({ totalCount: 0, houseCount: 0, apartmentCount: 0 });
  });

  it('should pass filters.tenantId for AM (cross-tenant narrowing)', async () => {
    await useCase.execute({ filters: { tenantId: 'tenant-1' }, actor: makeActor() });

    expect(propertyRepo.countByType).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });

  it('should query cross-tenant for OP without tenantId', async () => {
    await useCase.execute({ filters: {}, actor: makeActor({ role: 'OP' }) });

    expect(propertyRepo.countByType).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined }),
    );
  });

  it('should pass branchId and search through to the repository', async () => {
    await useCase.execute({
      filters: { branchId: 'branch-1', search: 'Main St' },
      actor: makeActor(),
    });

    expect(propertyRepo.countByType).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'branch-1', search: 'Main St' }),
    );
  });

  it('should ignore filters.tenantId for CL_USER and pin to actor.tenantId', async () => {
    await useCase.execute({
      filters: { tenantId: 'someone-elses-tenant' },
      actor: makeActor({ role: 'CL_USER', tenantId: 'own-tenant' }),
    });

    expect(propertyRepo.countByType).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'own-tenant' }),
    );
  });

  it('should fail closed (AUTH_FORBIDDEN) for CL roles with no tenantId on the actor', async () => {
    for (const role of ['CL_ADMIN', 'CL_USER'] as const) {
      await expect(
        useCase.execute({ filters: {}, actor: makeActor({ role, tenantId: null }) }),
      ).rejects.toThrow(ForbiddenError);
    }
    expect(propertyRepo.countByType).not.toHaveBeenCalled();
  });

  it('should throw AUTH_FORBIDDEN for INSP role', async () => {
    await expect(
      useCase.execute({ filters: {}, actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }) }),
    ).rejects.toThrow(ForbiddenError);
  });
});
