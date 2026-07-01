import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetServiceTypeUseCase } from '../../../src/modules/service-type/application/use-cases/get-service-type.use-case';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { AuthContext } from '@properfy/shared';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { ServiceTypeNotFoundError } from '../../../src/modules/service-type/domain/service-type.errors';

function makeServiceType(
  overrides: Partial<ConstructorParameters<typeof ServiceTypeEntity>[0]> = {},
): ServiceTypeEntity {
  return new ServiceTypeEntity({
    id: 'st-1',
    code: 'ROUTINE',
    name: 'Routine Inspection',
    flowType: 'ROUTINE',
    requiresRentalTenantConfirmation: true,
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

describe('GetServiceTypeUseCase', () => {
  let serviceTypeRepo: IServiceTypeRepository;
  let useCase: GetServiceTypeUseCase;

  beforeEach(() => {
    serviceTypeRepo = {
      findById: vi.fn(),
      findByCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    useCase = new GetServiceTypeUseCase(serviceTypeRepo);
  });

  it('should return service type for any authenticated role', async () => {
    const st = makeServiceType();
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(st);

    for (const role of ['AM', 'OP', 'CL_ADMIN', 'CL_USER', 'INSP'] as const) {
      const result = await useCase.execute({
        serviceTypeId: 'st-1',
        actor: makeActor({ role, tenantId: role === 'AM' ? null : 'tenant-1' }),
      });

      expect(result.id).toBe('st-1');
      expect(result.code).toBe('ROUTINE');
      expect(result.name).toBe('Routine Inspection');
    }
  });

  it('should throw SERVICE_TYPE_NOT_FOUND when not found', async () => {
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        serviceTypeId: 'nonexistent',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceTypeNotFoundError);
  });
});
