import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/update-service-group.use-case';
import type { IServiceGroupRepository, ServiceGroupWithAppointments } from '../../../src/modules/service-group/domain/service-group.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ServiceGroupEntity, type ServiceGroupProps } from '../../../src/modules/service-group/domain/service-group.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import {
  ServiceGroupNotFoundError,
  ServiceGroupNotDraftError,
  ServiceGroupInvalidStatusError,
  PriorityDateTooCloseError,
} from '../../../src/modules/service-group/domain/service-group.errors';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { futureDateStr } from '../../helpers/date-fixtures';
import { deriveTenantFixture } from '../../helpers/service-group-fixtures';

// `FUTURE_DATE` is used both as input and as the expected repo-call date.
// Keeping them in a single constant means we can't get them out of sync when
// the clock moves. The previous literal `'2026-07-15'` would have started
// failing the `priorityExpiresAt > now` guard around mid-2026.
const FUTURE_DATE = futureDateStr(120);
const FAR_FUTURE_DATE = futureDateStr(150);

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
    regionName: null,
    description: null,
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
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
  // Single-agency group fixture: one appointment so the group's primaryTenantId
  // resolves to 'tenant-1' (drives the per-agency priority-hours lookup).
  const appointments = [
    { id: 'appt-1', status: 'AWAITING_INSPECTOR', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'property-1', serviceGroupId: 'group-1' },
  ];
  return {
    group: new ServiceGroupEntity(makeGroupProps(overrides)),
    assignedInspectorName: null,
    appointments,
    ...deriveTenantFixture(appointments),
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
    const authorizationService = new AuthorizationService(auditService);
    useCase = new UpdateServiceGroupUseCase(serviceGroupRepo, auditService, authorizationService);
  });

  it('should update description in any status', async () => {
    const groupData = makeGroupWithAppointments({ status: 'PUBLISHED' });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);

    const result = await useCase.execute({
      groupId: 'group-1',
      description: 'Updated description',
      actor: makeActor(),
    });

    expect(result.id).toBe('group-1');
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      description: 'Updated description',
    });
  });

  it('should throw ForbiddenError for non-AM/OP roles', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        description: 'Updated',
        actor: makeActor({ role: 'CL_ADMIN' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ServiceGroupNotFoundError when group does not exist', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        groupId: 'nonexistent',
        description: 'Updated',
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
      scheduledDate: FUTURE_DATE,
      actor: makeActor(),
    });

    expect(result.id).toBe('group-1');
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      scheduledDate: new Date(FUTURE_DATE),
    });
  });

  it('should update priorityMode to PRIORITY_24H and recalculate priorityExpiresAt', async () => {
    const groupData = makeGroupWithAppointments({
      status: 'DRAFT',
      scheduledDate: new Date(FAR_FUTURE_DATE),
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
      new Date(new Date(FAR_FUTURE_DATE).getTime() - 24 * 60 * 60 * 1000),
    );
  });

  it('should throw ServiceGroupNotDraftError when updating scheduledDate on a PUBLISHED group', async () => {
    const groupData = makeGroupWithAppointments({ status: 'PUBLISHED' });
    vi.mocked(serviceGroupRepo.findById).mockResolvedValueOnce(groupData);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        scheduledDate: FUTURE_DATE,
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupNotDraftError);
  });

  it('should throw ServiceGroupInvalidStatusError when updating any field on an ACCEPTED group', async () => {
    const groupData = makeGroupWithAppointments({ status: 'ACCEPTED' });
    vi.mocked(serviceGroupRepo.findById).mockResolvedValueOnce(groupData);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        timeWindow: '10:00-14:00',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupInvalidStatusError);
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
      scheduledDate: FUTURE_DATE,
      actor: makeActor(),
    });

    const updateCall = vi.mocked(serviceGroupRepo.update).mock.calls[0]!;
    const updatePayload = updateCall[1];
    expect(updatePayload.scheduledDate).toEqual(new Date(FUTURE_DATE));
    expect(updatePayload.priorityExpiresAt).toEqual(
      new Date(new Date(FUTURE_DATE).getTime() - 24 * 60 * 60 * 1000),
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
      description: 'New description',
      scheduledDate: FAR_FUTURE_DATE,
      timeWindow: '10:00-14:00',
      actor: makeActor(),
    });

    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      description: 'New description',
      scheduledDate: new Date(FAR_FUTURE_DATE),
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

      const useCaseWithTenant = new UpdateServiceGroupUseCase(serviceGroupRepo, auditService, new AuthorizationService(auditService), tenantRepo);
      const groupData = makeGroupWithAppointments({
        status: 'DRAFT',
        scheduledDate: new Date(FAR_FUTURE_DATE),
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
        new Date(new Date(FAR_FUTURE_DATE).getTime() - 48 * 60 * 60 * 1000),
      );
    });

    it('should fall back to 24h when tenant has no priorityOfferHours setting', async () => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(
        makeTenantEntity({}),
      );

      const useCaseWithTenant = new UpdateServiceGroupUseCase(serviceGroupRepo, auditService, new AuthorizationService(auditService), tenantRepo);
      const groupData = makeGroupWithAppointments({
        status: 'DRAFT',
        scheduledDate: new Date(FAR_FUTURE_DATE),
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
        new Date(new Date(FAR_FUTURE_DATE).getTime() - 24 * 60 * 60 * 1000),
      );
    });

    it('should use tenant priorityOfferHours=48 when scheduledDate changes with existing PRIORITY_24H', async () => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(
        makeTenantEntity({ priorityOfferHours: 48 }),
      );

      const useCaseWithTenant = new UpdateServiceGroupUseCase(serviceGroupRepo, auditService, new AuthorizationService(auditService), tenantRepo);
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
        scheduledDate: FUTURE_DATE,
        actor: makeActor(),
      });

      const updateCall = vi.mocked(serviceGroupRepo.update).mock.calls[0]!;
      const updatePayload = updateCall[1];
      expect(updatePayload.priorityExpiresAt).toEqual(
        new Date(new Date(FUTURE_DATE).getTime() - 48 * 60 * 60 * 1000),
      );
    });

    it('should not call tenantRepo for STANDARD mode updates', async () => {
      const useCaseWithTenant = new UpdateServiceGroupUseCase(serviceGroupRepo, auditService, new AuthorizationService(auditService), tenantRepo);
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
      scheduledDate: FUTURE_DATE,
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
