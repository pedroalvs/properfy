import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateServiceTypeUseCase } from '../../../src/modules/service-type/application/use-cases/create-service-type.use-case';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { ServiceTypeCodeConflictError } from '../../../src/modules/service-type/domain/service-type.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

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

describe('CreateServiceTypeUseCase', () => {
  let serviceTypeRepo: IServiceTypeRepository;
  let auditService: AuditService;
  let useCase: CreateServiceTypeUseCase;

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
    useCase = new CreateServiceTypeUseCase(serviceTypeRepo, auditService);
  });

  it('should create service type for AM', async () => {
    vi.mocked(serviceTypeRepo.findByCode).mockResolvedValue(null);

    const result = await useCase.execute({
      code: 'INGOING',
      name: 'Ingoing Inspection',
      flowType: 'INGOING',
      requiresRentalTenantConfirmation: false,
      actor: makeActor(),
    });

    expect(result.code).toBe('INGOING');
    expect(result.name).toBe('Ingoing Inspection');
    expect(result.flowType).toBe('INGOING');
    expect(result.requiresRentalTenantConfirmation).toBe(false);
    expect(result.status).toBe('ACTIVE');
    expect(result.id).toBeDefined();
    expect(serviceTypeRepo.save).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'service_type.created' }),
    );
  });

  it('should require explicit requiresRentalTenantConfirmation — schema rejects omitted value', async () => {
    const { createServiceTypeSchema } = await import('@properfy/shared');
    const result = createServiceTypeSchema.safeParse({
      code: 'OUTGOING',
      name: 'Outgoing Inspection',
      flowType: 'OUTGOING',
      // requiresRentalTenantConfirmation intentionally omitted
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('requiresRentalTenantConfirmation');
    }
  });

  it('should accept explicit requiresRentalTenantConfirmation=false', async () => {
    vi.mocked(serviceTypeRepo.findByCode).mockResolvedValue(null);
    vi.mocked(serviceTypeRepo.save).mockResolvedValue(makeServiceType({ requiresRentalTenantConfirmation: false }));

    const result = await useCase.execute({
      code: 'OUTGOING',
      name: 'Outgoing Inspection',
      flowType: 'OUTGOING',
      requiresRentalTenantConfirmation: false,
      actor: makeActor(),
    });

    expect(result.requiresRentalTenantConfirmation).toBe(false);
  });

  it('should reject non-AM roles', async () => {
    for (const role of ['OP', 'CL_ADMIN', 'INSP', 'CL_USER'] as const) {
      await expect(
        useCase.execute({
          code: 'INGOING',
          name: 'Ingoing Inspection',
          flowType: 'INGOING',
          actor: makeActor({ role, tenantId: 'tenant-1' }),
        }),
      ).rejects.toThrow(ForbiddenError);
    }
  });

  it('should throw SERVICE_TYPE_CODE_CONFLICT when code already exists', async () => {
    vi.mocked(serviceTypeRepo.findByCode).mockResolvedValue(makeServiceType());

    await expect(
      useCase.execute({
        code: 'ROUTINE',
        name: 'Another Routine',
        flowType: 'ROUTINE',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceTypeCodeConflictError);
  });
});
