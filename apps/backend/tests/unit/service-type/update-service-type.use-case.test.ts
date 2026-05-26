import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateServiceTypeUseCase } from '../../../src/modules/service-type/application/use-cases/update-service-type.use-case';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { ServiceTypeNotFoundError } from '../../../src/modules/service-type/domain/service-type.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

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

describe('UpdateServiceTypeUseCase', () => {
  let serviceTypeRepo: IServiceTypeRepository;
  let auditService: AuditService;
  let useCase: UpdateServiceTypeUseCase;

  beforeEach(() => {
    serviceTypeRepo = {
      findById: vi.fn(),
      findByCode: vi.fn(),
      findByName: vi.fn().mockResolvedValue(null),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateServiceTypeUseCase(serviceTypeRepo, auditService);
  });

  it('should update service type for AM', async () => {
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(makeServiceType());

    const result = await useCase.execute({
      serviceTypeId: 'st-1',
      data: { name: 'Updated Name', status: 'INACTIVE' },
      actor: makeActor(),
    });

    expect(result.name).toBe('Updated Name');
    expect(result.status).toBe('INACTIVE');
    expect(serviceTypeRepo.update).toHaveBeenCalledWith('st-1', {
      name: 'Updated Name',
      status: 'INACTIVE',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_type.updated',
        before: expect.objectContaining({ name: 'Routine Inspection' }),
        after: expect.objectContaining({ name: 'Updated Name' }),
      }),
    );
  });

  it('should reject non-AM roles', async () => {
    for (const role of ['OP', 'CL_ADMIN', 'INSP', 'CL_USER'] as const) {
      await expect(
        useCase.execute({
          serviceTypeId: 'st-1',
          data: { name: 'Updated' },
          actor: makeActor({ role, tenantId: 'tenant-1' }),
        }),
      ).rejects.toThrow(ForbiddenError);
    }
  });

  it('should throw SERVICE_TYPE_NOT_FOUND when not found', async () => {
    vi.mocked(serviceTypeRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        serviceTypeId: 'nonexistent',
        data: { name: 'Updated' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceTypeNotFoundError);
  });
});
