import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/create-service-region.use-case';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ServiceRegionNameConflictError } from '../../../src/modules/service-region/domain/service-region.errors';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function createMockRepo(): IServiceRegionRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByName: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    save: vi.fn(),
    update: vi.fn(),
    findPropertyIdsInInspectorRegions: vi.fn().mockResolvedValue([]),
    resolveRegionsForAppointments: vi.fn().mockResolvedValue([]),
    findContainingPoint: vi.fn(),
    countPublishedGroupsByRegionId: vi.fn().mockResolvedValue(0).mockResolvedValue([]),
    countActiveInspectorsInRegion: vi.fn().mockResolvedValue(0),
    setInspectorRegions: vi.fn(),
    getInspectorRegionIds: vi.fn().mockResolvedValue([]),
    getInspectorRegionIdsBatch: vi.fn().mockResolvedValue(new Map()),
    delete: vi.fn(),
  };
}

describe('CreateServiceRegionUseCase', () => {
  let regionRepo: IServiceRegionRepository;
  let auditService: AuditService;
  let useCase: CreateServiceRegionUseCase;

  beforeEach(() => {
    regionRepo = createMockRepo();
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new CreateServiceRegionUseCase(regionRepo, auditService, authorizationService);
  });

  it('should create a region scoped to the actor tenant', async () => {
    const result = await useCase.execute({
      name: 'Sydney CBD',
      geojson: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      actor: makeActor(),
    });

    expect(result.name).toBe('Sydney CBD');
    expect(result.status).toBe('ACTIVE');
    expect(result.id).toBeDefined();
    expect(regionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', name: 'Sydney CBD' }),
    );
  });

  it('should check name uniqueness within tenant', async () => {
    vi.mocked(regionRepo.findByName).mockResolvedValue({
      id: 'existing-region', tenantId: 'tenant-1', name: 'Sydney CBD',
    } as any);

    await expect(
      useCase.execute({
        name: 'Sydney CBD',
        geojson: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceRegionNameConflictError);

    expect(regionRepo.findByName).toHaveBeenCalledWith('tenant-1', 'Sydney CBD');
  });

  it('should allow AM with null tenantId to create global region', async () => {
    const result = await useCase.execute({
      name: 'Test',
      geojson: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      actor: makeActor({ tenantId: null }),
    });

    expect(result).toBeDefined();
    expect(regionRepo.save).toHaveBeenCalled();
  });

  it('should reject for unauthorized roles', async () => {
    await expect(
      useCase.execute({
        name: 'Test',
        geojson: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        actor: makeActor({ role: 'CL_ADMIN' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should allow OP role to create', async () => {
    const result = await useCase.execute({
      name: 'Test',
      geojson: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.status).toBe('ACTIVE');
  });

  it('should use default color when not provided', async () => {
    const result = await useCase.execute({
      name: 'Test',
      geojson: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      actor: makeActor(),
    });

    expect(result.color).toBe('#3b82f6');
  });

  it('should log audit event', async () => {
    await useCase.execute({
      name: 'Test',
      geojson: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      actor: makeActor(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_region.created',
        actorId: 'user-1',
        entityType: 'ServiceRegion',
        after: expect.objectContaining({ tenantId: 'tenant-1' }),
      }),
    );
  });
});
