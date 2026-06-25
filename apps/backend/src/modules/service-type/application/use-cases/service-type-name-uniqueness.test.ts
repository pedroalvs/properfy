import { describe, expect, it, vi } from 'vitest';
import { CreateServiceTypeUseCase } from './create-service-type.use-case';
import { UpdateServiceTypeUseCase } from './update-service-type.use-case';
import { ServiceTypeNameConflictError, ServiceTypeCodeConflictError } from '../../domain/service-type.errors';
import { ServiceTypeEntity } from '../../domain/service-type.entity';

const AM_ACTOR = { userId: 'u-1', tenantId: null, role: 'AM', email: 'am@test.com' } as any;

function makeEntity(overrides: Partial<ConstructorParameters<typeof ServiceTypeEntity>[0]> = {}) {
  return new ServiceTypeEntity({
    id: 'st-1',
    code: 'EXISTING',
    name: 'Routine Inspection',
    flowType: 'STANDARD' as any,
    requiresTenantConfirmation: true,
    status: 'ACTIVE' as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

const auditService = { log: vi.fn() } as any;

describe('CreateServiceTypeUseCase — name uniqueness', () => {
  it('throws ServiceTypeNameConflictError when name already exists (exact match)', async () => {
    const repo = {
      findByCode: vi.fn().mockResolvedValue(null),
      findByName: vi.fn().mockResolvedValue(makeEntity()),
      save: vi.fn(),
    } as any;

    const useCase = new CreateServiceTypeUseCase(repo, auditService);

    await expect(
      useCase.execute({
        code: 'NEW',
        name: 'Routine Inspection',
        flowType: 'STANDARD' as any,
        requiresTenantConfirmation: true,
        actor: AM_ACTOR,
      }),
    ).rejects.toThrow(ServiceTypeNameConflictError);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('throws ServiceTypeNameConflictError when name matches case-insensitively', async () => {
    const repo = {
      findByCode: vi.fn().mockResolvedValue(null),
      findByName: vi.fn().mockResolvedValue(makeEntity()),
      save: vi.fn(),
    } as any;

    const useCase = new CreateServiceTypeUseCase(repo, auditService);

    await expect(
      useCase.execute({
        code: 'NEW',
        name: 'routine inspection',
        flowType: 'STANDARD' as any,
        requiresTenantConfirmation: true,
        actor: AM_ACTOR,
      }),
    ).rejects.toThrow(ServiceTypeNameConflictError);
  });

  it('throws ServiceTypeCodeConflictError when code already exists (checked first)', async () => {
    const repo = {
      findByCode: vi.fn().mockResolvedValue(makeEntity()),
      findByName: vi.fn(),
      save: vi.fn(),
    } as any;

    const useCase = new CreateServiceTypeUseCase(repo, auditService);

    await expect(
      useCase.execute({
        code: 'EXISTING',
        name: 'New Name',
        flowType: 'STANDARD' as any,
        requiresTenantConfirmation: true,
        actor: AM_ACTOR,
      }),
    ).rejects.toThrow(ServiceTypeCodeConflictError);

    expect(repo.findByName).not.toHaveBeenCalled();
  });

  it('saves when both code and name are unique', async () => {
    const repo = {
      findByCode: vi.fn().mockResolvedValue(null),
      findByName: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
    } as any;

    const useCase = new CreateServiceTypeUseCase(repo, auditService);

    await useCase.execute({
      code: 'NEW',
      name: 'Brand New Type',
      flowType: 'STANDARD' as any,
      requiresTenantConfirmation: true,
      actor: AM_ACTOR,
    });

    expect(repo.save).toHaveBeenCalledOnce();
  });
});

describe('UpdateServiceTypeUseCase — name uniqueness', () => {
  it('throws ServiceTypeNameConflictError when renaming to a name used by another record', async () => {
    const existing = makeEntity({ id: 'st-1', name: 'Routine Inspection' });
    const conflicting = makeEntity({ id: 'st-2', name: 'Outgoing Inspection' });

    const repo = {
      findById: vi.fn().mockResolvedValue(existing),
      findByName: vi.fn().mockResolvedValue(conflicting),
      update: vi.fn(),
    } as any;

    const useCase = new UpdateServiceTypeUseCase(repo, auditService);

    await expect(
      useCase.execute({
        serviceTypeId: 'st-1',
        data: { name: 'Outgoing Inspection' },
        actor: AM_ACTOR,
      }),
    ).rejects.toThrow(ServiceTypeNameConflictError);

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('does NOT throw when renaming to the same name (self-update)', async () => {
    const existing = makeEntity({ id: 'st-1', name: 'Routine Inspection' });

    const repo = {
      findById: vi.fn().mockResolvedValue(existing),
      findByName: vi.fn().mockResolvedValue(existing),
      update: vi.fn(),
    } as any;

    const useCase = new UpdateServiceTypeUseCase(repo, auditService);

    await expect(
      useCase.execute({
        serviceTypeId: 'st-1',
        data: { name: 'Routine Inspection' },
        actor: AM_ACTOR,
      }),
    ).resolves.not.toThrow();
  });

  it('does NOT check name uniqueness when name field is not being updated', async () => {
    const existing = makeEntity({ id: 'st-1' });

    const repo = {
      findById: vi.fn().mockResolvedValue(existing),
      findByName: vi.fn(),
      update: vi.fn(),
    } as any;

    const useCase = new UpdateServiceTypeUseCase(repo, auditService);

    await useCase.execute({
      serviceTypeId: 'st-1',
      data: { requiresTenantConfirmation: false },
      actor: AM_ACTOR,
    });

    expect(repo.findByName).not.toHaveBeenCalled();
  });
});
