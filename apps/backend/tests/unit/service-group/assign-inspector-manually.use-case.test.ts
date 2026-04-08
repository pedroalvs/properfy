import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssignInspectorManuallyUseCase } from '../../../src/modules/service-group/application/use-cases/assign-inspector-manually.use-case';
import type { IServiceGroupRepository } from '../../../src/modules/service-group/domain/service-group.repository';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  InspectorInactiveError,
  InspectorServiceTypeIneligibleError,
  AssignedInspectorConflictError,
} from '../../../src/modules/service-group/domain/service-group.errors';

function makeGroup(overrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {}): ServiceGroupEntity {
  return new ServiceGroupEntity({
    id: 'group-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'svc-type-1',
    status: 'PUBLISHED',
    groupSize: 5,
    offeredCount: 1,
    confirmedCount: 0,
    scheduledDate: new Date('2026-04-01'),
    timeWindow: '08:00-12:00',
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
    assignedInspectorId: null,
    publishedAt: new Date(),
    assignedAt: null,
    name: null,
    regionName: null,
    description: null,
    createdByUserId: 'user-op',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeInspector(overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {}): InspectorEntity {
  return new InspectorEntity({
    id: 'inspector-1',
    name: 'John Inspector',
    email: 'john@inspectors.com',
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [{ serviceTypeId: 'svc-type-1', certified: false }],
    clientEligibilityJson: [{ tenantId: 'tenant-1', eligible: true }],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeGroupWithAppointments(
  groupOverrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
  appointmentCount = 5,
) {
  const group = makeGroup(groupOverrides);
  const appointments = Array.from({ length: appointmentCount }, (_, i) => ({
    id: `appt-${i + 1}`,
    status: 'AWAITING_INSPECTOR',
    serviceTypeId: 'svc-type-1',
    tenantId: 'tenant-1',
    propertyId: `prop-${i + 1}`,
    serviceGroupId: group.id,
  }));
  return { group, appointments };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('AssignInspectorManuallyUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let inspectorRepo: IInspectorRepository;
  let serviceRegionRepo: IServiceRegionRepository;
  let auditService: AuditService;
  let idempotencyService: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; getWithHash: ReturnType<typeof vi.fn> };
  let useCase: AssignInspectorManuallyUseCase;

  beforeEach(() => {
    serviceGroupRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      acceptOptimistic: vi.fn(),
      findPublishedForInspector: vi.fn(),
      findPublishedOfferDetail: vi.fn(),
      countPublishedForInspector: vi.fn(),
      linkAppointments: vi.fn(),
      unlinkAppointments: vi.fn(),
      scheduleAppointments: vi.fn(),
      revertScheduledAppointments: vi.fn(),
      findExpiredPublished: vi.fn(),
    };
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findByRegionId: vi.fn(),
    };
    serviceRegionRepo = {
      findById: vi.fn(),
      findByName: vi.fn().mockResolvedValue(null),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findPropertyIdsInInspectorRegions: vi.fn().mockResolvedValue(['prop-1', 'prop-2', 'prop-3', 'prop-4', 'prop-5']),
      resolveRegionsForAppointments: vi.fn().mockResolvedValue([]),
      findContainingPoint: vi.fn().mockResolvedValue([]),
      countPublishedGroupsByRegionId: vi.fn().mockResolvedValue(0),
      countActiveInspectorsInRegion: vi.fn().mockResolvedValue(0),
      setInspectorRegions: vi.fn(),
      getInspectorRegionIds: vi.fn().mockResolvedValue([]),
      getInspectorRegionIdsBatch: vi.fn().mockResolvedValue(new Map()),
      delete: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    idempotencyService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      getWithHash: vi.fn().mockResolvedValue(null),
    };

    useCase = new AssignInspectorManuallyUseCase(
      serviceGroupRepo,
      inspectorRepo,
      auditService,
      serviceRegionRepo,
      idempotencyService,
    );
  });

  it('should assign inspector to DRAFT group successfully', async () => {
    const groupData = makeGroupWithAppointments({ status: 'DRAFT', publishedAt: null });
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);

    const result = await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.id).toBe('group-1');
    expect(result.status).toBe('ACCEPTED');
    expect(result.assignedInspectorId).toBe('inspector-1');
    expect(result.appointmentsScheduled).toBe(5);
  });

  it('should assign inspector to PUBLISHED group successfully', async () => {
    const groupData = makeGroupWithAppointments({ status: 'PUBLISHED' });
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);

    const result = await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.status).toBe('ACCEPTED');
    expect(result.assignedInspectorId).toBe('inspector-1');
  });

  it('should reject non-AM/OP actors', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ServiceGroupNotFoundError for missing group', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        groupId: 'nonexistent',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(ServiceGroupNotFoundError);
  });

  it('should return idempotent success for ACCEPTED group with same inspector', async () => {
    const groupData = makeGroupWithAppointments({
      status: 'ACCEPTED',
      assignedInspectorId: 'inspector-1',
      confirmedCount: 5,
    });
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);

    const result = await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.id).toBe('group-1');
    expect(result.status).toBe('ACCEPTED');
    expect(result.assignedInspectorId).toBe('inspector-1');
    expect(result.appointmentsScheduled).toBe(5);
    expect(serviceGroupRepo.update).not.toHaveBeenCalled();
  });

  it('should throw AssignedInspectorConflictError for ACCEPTED group with different inspector', async () => {
    const groupData = makeGroupWithAppointments({
      status: 'ACCEPTED',
      assignedInspectorId: 'inspector-other',
    });
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(AssignedInspectorConflictError);
  });

  it('should throw ServiceGroupInvalidStatusError for CANCELLED group', async () => {
    const groupData = makeGroupWithAppointments({ status: 'CANCELLED' });
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(ServiceGroupInvalidStatusError);
  });

  it('should throw NotFoundError for missing inspector', async () => {
    const groupData = makeGroupWithAppointments();
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'nonexistent',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('should throw InspectorInactiveError for inactive inspector', async () => {
    const groupData = makeGroupWithAppointments();
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ status: 'INACTIVE' }),
    );

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(InspectorInactiveError);
  });

  it('should throw InspectorServiceTypeIneligibleError when inspector cannot do the service type', async () => {
    const groupData = makeGroupWithAppointments();
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ serviceTypesJson: [{ serviceTypeId: 'svc-type-other', certified: false }] }),
    );

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(InspectorServiceTypeIneligibleError);
  });

  it('should call scheduleAppointments and update confirmedCount', async () => {
    const groupData = makeGroupWithAppointments();
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);

    await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(serviceGroupRepo.scheduleAppointments).toHaveBeenCalledWith('group-1', 'inspector-1');
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      confirmedCount: 5,
    });
  });

  it('should log audit with correct action', async () => {
    const groupData = makeGroupWithAppointments();
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);

    await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.manually_assigned',
        actorType: 'USER',
        actorId: 'user-1',
        entityType: 'ServiceGroup',
        entityId: 'group-1',
        tenantId: 'tenant-1',
        before: { status: 'PUBLISHED' },
        after: expect.objectContaining({
          status: 'ACCEPTED',
          assignedInspectorId: 'inspector-1',
          appointmentsScheduled: 5,
        }),
      }),
    );
  });

  it('should return cached result on idempotency replay (no double assignment)', async () => {
    const cachedResult = {
      id: 'group-1',
      status: 'ACCEPTED',
      assignedInspectorId: 'inspector-1',
      appointmentsScheduled: 5,
    };
    idempotencyService.get.mockResolvedValue(cachedResult);

    const result = await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result).toEqual(cachedResult);
    expect(serviceGroupRepo.findById).not.toHaveBeenCalled();
    expect(serviceGroupRepo.update).not.toHaveBeenCalled();
    expect(serviceGroupRepo.scheduleAppointments).not.toHaveBeenCalled();
    expect(idempotencyService.get).toHaveBeenCalledWith(
      'assign-inspector:group-1:inspector-1',
      'assign-inspector',
    );
  });

  it('should return cached result even when replayed with a different inspectorId', async () => {
    const cachedResult = {
      id: 'group-1',
      status: 'ACCEPTED',
      assignedInspectorId: 'inspector-1',
      appointmentsScheduled: 5,
    };
    // The key is derived from the input inspectorId, but if a caller provides an explicit
    // idempotencyKey that matches a previous assignment, the cached result is returned.
    idempotencyService.get.mockResolvedValue(cachedResult);

    const result = await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-2',
      actor: makeActor({ role: 'AM' }),
      idempotencyKey: 'assign-inspector:group-1:inspector-1',
    });

    expect(result).toEqual(cachedResult);
    expect(serviceGroupRepo.findById).not.toHaveBeenCalled();
    expect(serviceGroupRepo.update).not.toHaveBeenCalled();
  });

  it('should cache result after successful assignment', async () => {
    idempotencyService.get.mockResolvedValue(null);
    const groupData = makeGroupWithAppointments();
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);

    await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(idempotencyService.set).toHaveBeenCalledWith(
      'assign-inspector:group-1:inspector-1',
      'assign-inspector',
      expect.objectContaining({
        id: 'group-1',
        status: 'ACCEPTED',
        assignedInspectorId: 'inspector-1',
        appointmentsScheduled: 5,
      }),
      24,
    );
  });

  it('should not produce double assignment on sequential retries', async () => {
    // First call: no cache, executes fully
    idempotencyService.get.mockResolvedValueOnce(null);
    const groupData = makeGroupWithAppointments();
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(groupData);
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);

    const firstResult = await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(firstResult.status).toBe('ACCEPTED');
    expect(serviceGroupRepo.update).toHaveBeenCalledTimes(2); // status + confirmedCount

    // Second call: cache hit, returns cached result without side effects
    const cachedResult = {
      id: 'group-1',
      status: 'ACCEPTED',
      assignedInspectorId: 'inspector-1',
      appointmentsScheduled: 5,
    };
    idempotencyService.get.mockResolvedValueOnce(cachedResult);

    // Reset call counts to verify no additional side effects
    vi.mocked(serviceGroupRepo.update).mockClear();
    vi.mocked(serviceGroupRepo.scheduleAppointments).mockClear();

    const secondResult = await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(secondResult).toEqual(cachedResult);
    expect(serviceGroupRepo.update).not.toHaveBeenCalled();
    expect(serviceGroupRepo.scheduleAppointments).not.toHaveBeenCalled();
  });
});
