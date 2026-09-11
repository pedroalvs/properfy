import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactivateServiceRegionUseCase } from '../../../src/modules/service-region/application/use-cases/reactivate-service-region.use-case';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import {
  ServiceRegionNotFoundError,
  ServiceRegionAlreadyActiveError,
} from '../../../src/modules/service-region/domain/service-region.errors';
import { ServiceRegionEntity } from '../../../src/modules/service-region/domain/service-region.entity';
import { DomainEventBus, SERVICE_REGION_EVENTS } from '../../../src/shared/application/events/domain-event-bus';

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
    findById: vi.fn(),
    findByName: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    findPropertyIdsInInspectorRegions: vi.fn(),
    resolveRegionsForAppointments: vi.fn(),
    findContainingPoint: vi.fn(),
    countPublishedGroupsByRegionId: vi.fn().mockResolvedValue(0),
    countActiveInspectorsInRegion: vi.fn(),
    setInspectorRegions: vi.fn(),
    getInspectorRegionIds: vi.fn(),
    getInspectorRegionIdsBatch: vi.fn(),
    delete: vi.fn(),
  } as unknown as IServiceRegionRepository;
}

function makeRegion(status: 'ACTIVE' | 'INACTIVE', tenantId: string | null = 'tenant-1'): ServiceRegionEntity {
  return new ServiceRegionEntity({
    id: 'region-1',
    tenantId,
    name: 'Sydney CBD',
    geojson: {},
    color: '#3b82f6',
    status,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('ReactivateServiceRegionUseCase', () => {
  let regionRepo: IServiceRegionRepository;
  let auditService: AuditService;
  let useCase: ReactivateServiceRegionUseCase;

  beforeEach(() => {
    regionRepo = createMockRepo();
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new ReactivateServiceRegionUseCase(regionRepo, auditService, new AuthorizationService(auditService));
  });

  it('flips an INACTIVE region to ACTIVE, scoped by tenant', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(makeRegion('INACTIVE'));

    const result = await useCase.execute({
      regionId: 'region-1',
      reason: 'Coverage restored',
      actor: makeActor(),
    });

    expect(result.status).toBe('ACTIVE');
    expect(regionRepo.findById).toHaveBeenCalledWith('region-1', 'tenant-1');
    expect(regionRepo.update).toHaveBeenCalledWith('region-1', 'tenant-1', { status: 'ACTIVE' });
  });

  it('writes an audit log entry with the reason', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(makeRegion('INACTIVE'));

    await useCase.execute({ regionId: 'region-1', reason: 'Restored', actor: makeActor() });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_region.reactivated',
        entityType: 'ServiceRegion',
        entityId: 'region-1',
        before: { status: 'INACTIVE' },
        after: { status: 'ACTIVE' },
        reason: 'Restored',
      }),
    );
  });

  it('throws when the region is already active', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(makeRegion('ACTIVE'));

    await expect(
      useCase.execute({ regionId: 'region-1', reason: 'x', actor: makeActor() }),
    ).rejects.toThrow(ServiceRegionAlreadyActiveError);

    expect(regionRepo.update).not.toHaveBeenCalled();
  });

  it('throws NotFound for cross-tenant access', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ regionId: 'region-1', reason: 'x', actor: makeActor({ tenantId: 'other' }) }),
    ).rejects.toThrow(ServiceRegionNotFoundError);
  });

  it('AM with null tenantId derives tenantId from entity', async () => {
    vi.mocked(regionRepo.findById).mockResolvedValue(makeRegion('INACTIVE', 'tenant-from-db'));

    await useCase.execute({ regionId: 'region-1', reason: 'x', actor: makeActor({ tenantId: null }) });

    expect(regionRepo.findById).toHaveBeenCalledWith('region-1', null);
    expect(regionRepo.update).toHaveBeenCalledWith('region-1', 'tenant-from-db', { status: 'ACTIVE' });
  });

  it('rejects non AM/OP roles', async () => {
    await expect(
      useCase.execute({ regionId: 'region-1', reason: 'x', actor: makeActor({ role: 'INSP' }) }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('emits service_region.reactivated.v1 after reactivation', async () => {
    const eventBus = new DomainEventBus();
    const emitSpy = vi.spyOn(eventBus, 'emit');
    const useCaseWithEvents = new ReactivateServiceRegionUseCase(
      regionRepo,
      auditService,
      new AuthorizationService(auditService),
      eventBus,
    );
    vi.mocked(regionRepo.findById).mockResolvedValue(makeRegion('INACTIVE'));

    await useCaseWithEvents.execute({ regionId: 'region-1', reason: 'x', actor: makeActor() });

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SERVICE_REGION_EVENTS.REACTIVATED,
        payload: { regionId: 'region-1', tenantId: 'tenant-1', regionName: 'Sydney CBD' },
      }),
    );
  });
});
