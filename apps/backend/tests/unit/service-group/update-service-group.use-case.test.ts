import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/update-service-group.use-case';
import type { IServiceGroupRepository, ServiceGroupWithAppointments } from '../../../src/modules/service-group/domain/service-group.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ServiceGroupEntity, type ServiceGroupProps } from '../../../src/modules/service-group/domain/service-group.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import {
  ServiceGroupNotFoundError,
  ServiceGroupNotDraftError,
  PriorityDateTooCloseError,
} from '../../../src/modules/service-group/domain/service-group.errors';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';

function makeGroupProps(overrides: Partial<ServiceGroupProps> = {}): ServiceGroupProps {
  return {
    id: 'group-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'svc-type-1',
    status: 'DRAFT',
    groupSize: 5,
    offeredCount: 0,
    confirmedCount: 0,
    scheduledDate: new Date('2026-06-01'),
    timeWindow: '09:00-12:00',
    name: 'Test Group',
    regionName: null,
    description: null,
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
    exceptionType: null,
    exceptionReason: null,
    assignedInspectorId: null,
    serviceRegionId: null,
    publishedAt: null,
    assignedAt: null,
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeGroupWithAppointments(
  overrides: Partial<ServiceGroupProps> = {},
): ServiceGroupWithAppointments {
  return {
    group: new ServiceGroupEntity(makeGroupProps(overrides)),
    assignedInspectorName: null,
    appointments: [],
  };
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

function makeRepo(): IServiceGroupRepository {
  return {
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
    revertScheduledAppointments: vi.fn(),
    scheduleAppointments: vi.fn(),
    findExpiredPublished: vi.fn(),
  };
}

describe('UpdateServiceGroupUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let auditService: AuditService;
  let useCase: UpdateServiceGroupUseCase;

  beforeEach(() => {
    serviceGroupRepo = makeRepo();
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateServiceGroupUseCase(serviceGroupRepo, auditService);
  });

  it('should update name and description in any status', async () => {
    const groupData = makeGroupWithAppointments({ status: 'PUBLISHED' });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);

    const result = await useCase.execute({
      groupId: 'group-1',
      name: 'Updated Name',
      description: 'Updated description',
      actor: makeActor(),
    });

    expect(result.id).toBe('group-1');
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      name: 'Updated Name',
      description: 'Updated description',
    });
  });

  it('should throw ForbiddenError for non-AM/OP roles', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        name: 'Updated',
        actor: makeActor({ role: 'CL_ADMIN' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ServiceGroupNotFoundError when group does not exist', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        groupId: 'nonexistent',
        name: 'Updated',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupNotFoundError);
  });

  // --- GAP-009: Draft-only field tests ---

  it('should update scheduledDate on a DRAFT group', async () => {
    const groupData = makeGroupWithAppointments({ status: 'DRAFT' });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);

    const result = await useCase.execute({
      groupId: 'group-1',
      scheduledDate: '2026-07-15',
      actor: makeActor(),
    });

    expect(result.id).toBe('group-1');
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      scheduledDate: new Date('2026-07-15'),
    });
  });

  it('should update priorityMode to PRIORITY_24H and recalculate priorityExpiresAt', async () => {
    const groupData = makeGroupWithAppointments({
      status: 'DRAFT',
      scheduledDate: new Date('2026-06-01'),
    });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);

    const result = await useCase.execute({
      groupId: 'group-1',
      priorityMode: 'PRIORITY_24H',
      actor: makeActor(),
    });

    expect(result.id).toBe('group-1');
    const updateCall = vi.mocked(serviceGroupRepo.update).mock.calls[0]!;
    const updatePayload = updateCall[1];
    expect(updatePayload.priorityMode).toBe('PRIORITY_24H');
    expect(updatePayload.priorityExpiresAt).toEqual(
      new Date(new Date('2026-06-01').getTime() - 24 * 60 * 60 * 1000),
    );
  });

  it('should throw ServiceGroupNotDraftError when updating scheduledDate on a PUBLISHED group', async () => {
    const groupData = makeGroupWithAppointments({ status: 'PUBLISHED' });
    vi.mocked(serviceGroupRepo.findById).mockResolvedValueOnce(groupData);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        scheduledDate: '2026-07-15',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupNotDraftError);
  });

  it('should throw ServiceGroupNotDraftError when updating timeWindow on an ACCEPTED group', async () => {
    const groupData = makeGroupWithAppointments({ status: 'ACCEPTED' });
    vi.mocked(serviceGroupRepo.findById).mockResolvedValueOnce(groupData);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        timeWindow: '10:00-14:00',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupNotDraftError);
  });

  it('should throw ServiceGroupNotDraftError when updating priorityMode on a non-DRAFT group', async () => {
    const groupData = makeGroupWithAppointments({ status: 'PUBLISHED' });
    vi.mocked(serviceGroupRepo.findById).mockResolvedValueOnce(groupData);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        priorityMode: 'PRIORITY_24H',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupNotDraftError);
  });

  it('should update exceptionType and exceptionReason on a DRAFT group', async () => {
    const groupData = makeGroupWithAppointments({ status: 'DRAFT' });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);

    const result = await useCase.execute({
      groupId: 'group-1',
      exceptionType: 'LOW_DENSITY_REGION',
      exceptionReason: 'Remote area with very few properties for inspection',
      actor: makeActor(),
    });

    expect(result.id).toBe('group-1');
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      exceptionType: 'LOW_DENSITY_REGION',
      exceptionReason: 'Remote area with very few properties for inspection',
    });
  });

  it('should clear exceptionType and exceptionReason when set to null', async () => {
    const groupData = makeGroupWithAppointments({
      status: 'DRAFT',
      exceptionType: 'LOW_DENSITY_REGION',
      exceptionReason: 'Some reason here for testing',
    });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);

    await useCase.execute({
      groupId: 'group-1',
      exceptionType: null,
      exceptionReason: null,
      actor: makeActor(),
    });

    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      exceptionType: null,
      exceptionReason: null,
    });
  });

  it('should recalculate priorityExpiresAt when scheduledDate changes and priorityMode is PRIORITY_24H', async () => {
    const groupData = makeGroupWithAppointments({
      status: 'DRAFT',
      priorityMode: 'PRIORITY_24H',
      priorityExpiresAt: new Date(new Date('2026-06-01').getTime() - 24 * 60 * 60 * 1000),
      scheduledDate: new Date('2026-06-01'),
    });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);

    await useCase.execute({
      groupId: 'group-1',
      scheduledDate: '2026-07-15',
      actor: makeActor(),
    });

    const updateCall = vi.mocked(serviceGroupRepo.update).mock.calls[0]!;
    const updatePayload = updateCall[1];
    expect(updatePayload.scheduledDate).toEqual(new Date('2026-07-15'));
    expect(updatePayload.priorityExpiresAt).toEqual(
      new Date(new Date('2026-07-15').getTime() - 24 * 60 * 60 * 1000),
    );
  });

  it('should clear priorityExpiresAt when priorityMode changes to STANDARD', async () => {
    const groupData = makeGroupWithAppointments({
      status: 'DRAFT',
      priorityMode: 'PRIORITY_24H',
      priorityExpiresAt: new Date('2026-05-31'),
    });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);

    await useCase.execute({
      groupId: 'group-1',
      priorityMode: 'STANDARD',
      actor: makeActor(),
    });

    const updateCall = vi.mocked(serviceGroupRepo.update).mock.calls[0]!;
    const updatePayload = updateCall[1];
    expect(updatePayload.priorityMode).toBe('STANDARD');
    expect(updatePayload.priorityExpiresAt).toBeNull();
  });

  it('should throw PriorityDateTooCloseError when setting PRIORITY_24H with a date too close', async () => {
    const groupData = makeGroupWithAppointments({
      status: 'DRAFT',
      scheduledDate: new Date('2020-01-01'), // past date
    });
    vi.mocked(serviceGroupRepo.findById).mockResolvedValueOnce(groupData);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        priorityMode: 'PRIORITY_24H',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PriorityDateTooCloseError);
  });

  it('should allow updating both draft-only and general fields together on a DRAFT group', async () => {
    const groupData = makeGroupWithAppointments({ status: 'DRAFT' });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);

    await useCase.execute({
      groupId: 'group-1',
      name: 'New Name',
      scheduledDate: '2026-08-01',
      timeWindow: '10:00-14:00',
      actor: makeActor(),
    });

    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      name: 'New Name',
      scheduledDate: new Date('2026-08-01'),
      timeWindow: '10:00-14:00',
    });
  });

  // --- GAP-011: Configurable priority offer hours ---

  describe('GAP-011: configurable priority offer hours', () => {
    let tenantRepo: ITenantRepository;

    function makeTenantEntity(settingsJson: Record<string, unknown> = {}): TenantEntity {
      return new TenantEntity({
        id: 'tenant-1',
        name: 'Test Tenant',
        legalName: 'Test Tenant Pty Ltd',
        status: 'ACTIVE',
        timezone: 'Australia/Sydney',
        currency: 'AUD',
        settingsJson,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    }

    beforeEach(() => {
      tenantRepo = {
        findById: vi.fn().mockResolvedValue(makeTenantEntity({ priorityOfferHours: 24 })),
        findByLegalName: vi.fn(),
        findAll: vi.fn(),
        count: vi.fn(),
        save: vi.fn(),
        update: vi.fn(),
      };
    });

    it('should use tenant priorityOfferHours=48 when changing priorityMode to PRIORITY_24H', async () => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(
        makeTenantEntity({ priorityOfferHours: 48 }),
      );

      const useCaseWithTenant = new UpdateServiceGroupUseCase(serviceGroupRepo, auditService, tenantRepo);
      const groupData = makeGroupWithAppointments({
        status: 'DRAFT',
        scheduledDate: new Date('2026-06-01'),
      });
      vi.mocked(serviceGroupRepo.findById)
        .mockResolvedValueOnce(groupData)
        .mockResolvedValueOnce(groupData);

      await useCaseWithTenant.execute({
        groupId: 'group-1',
        priorityMode: 'PRIORITY_24H',
        actor: makeActor(),
      });

      const updateCall = vi.mocked(serviceGroupRepo.update).mock.calls[0]!;
      const updatePayload = updateCall[1];
      expect(updatePayload.priorityExpiresAt).toEqual(
        new Date(new Date('2026-06-01').getTime() - 48 * 60 * 60 * 1000),
      );
    });

    it('should fall back to 24h when tenant has no priorityOfferHours setting', async () => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(
        makeTenantEntity({}),
      );

      const useCaseWithTenant = new UpdateServiceGroupUseCase(serviceGroupRepo, auditService, tenantRepo);
      const groupData = makeGroupWithAppointments({
        status: 'DRAFT',
        scheduledDate: new Date('2026-06-01'),
      });
      vi.mocked(serviceGroupRepo.findById)
        .mockResolvedValueOnce(groupData)
        .mockResolvedValueOnce(groupData);

      await useCaseWithTenant.execute({
        groupId: 'group-1',
        priorityMode: 'PRIORITY_24H',
        actor: makeActor(),
      });

      const updateCall = vi.mocked(serviceGroupRepo.update).mock.calls[0]!;
      const updatePayload = updateCall[1];
      expect(updatePayload.priorityExpiresAt).toEqual(
        new Date(new Date('2026-06-01').getTime() - 24 * 60 * 60 * 1000),
      );
    });

    it('should use tenant priorityOfferHours=48 when scheduledDate changes with existing PRIORITY_24H', async () => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(
        makeTenantEntity({ priorityOfferHours: 48 }),
      );

      const useCaseWithTenant = new UpdateServiceGroupUseCase(serviceGroupRepo, auditService, tenantRepo);
      const groupData = makeGroupWithAppointments({
        status: 'DRAFT',
        priorityMode: 'PRIORITY_24H',
        priorityExpiresAt: new Date(new Date('2026-06-01').getTime() - 24 * 60 * 60 * 1000),
        scheduledDate: new Date('2026-06-01'),
      });
      vi.mocked(serviceGroupRepo.findById)
        .mockResolvedValueOnce(groupData)
        .mockResolvedValueOnce(groupData);

      await useCaseWithTenant.execute({
        groupId: 'group-1',
        scheduledDate: '2026-07-15',
        actor: makeActor(),
      });

      const updateCall = vi.mocked(serviceGroupRepo.update).mock.calls[0]!;
      const updatePayload = updateCall[1];
      expect(updatePayload.priorityExpiresAt).toEqual(
        new Date(new Date('2026-07-15').getTime() - 48 * 60 * 60 * 1000),
      );
    });

    it('should not call tenantRepo for STANDARD mode updates', async () => {
      const useCaseWithTenant = new UpdateServiceGroupUseCase(serviceGroupRepo, auditService, tenantRepo);
      const groupData = makeGroupWithAppointments({
        status: 'DRAFT',
        priorityMode: 'PRIORITY_24H',
        priorityExpiresAt: new Date('2026-05-31'),
      });
      vi.mocked(serviceGroupRepo.findById)
        .mockResolvedValueOnce(groupData)
        .mockResolvedValueOnce(groupData);

      await useCaseWithTenant.execute({
        groupId: 'group-1',
        priorityMode: 'STANDARD',
        actor: makeActor(),
      });

      expect(tenantRepo.findById).not.toHaveBeenCalled();
      const updateCall = vi.mocked(serviceGroupRepo.update).mock.calls[0]!;
      expect(updateCall[1].priorityExpiresAt).toBeNull();
    });
  });

  it('should log audit entry with updated fields', async () => {
    const groupData = makeGroupWithAppointments({ status: 'DRAFT' });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);

    await useCase.execute({
      groupId: 'group-1',
      scheduledDate: '2026-07-15',
      actor: makeActor(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.updated',
        entityType: 'ServiceGroup',
        entityId: 'group-1',
        tenantId: 'tenant-1',
      }),
    );
  });
});
