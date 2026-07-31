import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnpublishServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/unpublish-service-group.use-case';
import type { IServiceGroupRepository, ServiceGroupWithAppointments } from '../../../src/modules/service-group/domain/service-group.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { deriveTenantFixture } from '../../helpers/service-group-fixtures';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  GroupAlreadyAcceptedError,
} from '../../../src/modules/service-group/domain/service-group.errors';

function makeGroup(
  overrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
): ServiceGroupEntity {
  return new ServiceGroupEntity({
    id: 'group-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'svc-type-1',
    status: 'PUBLISHED',
    groupSize: 5,
    offeredCount: 1,
    confirmedCount: 0,
    scheduledDate: new Date('2026-06-01'),
    timeWindow: '09:00-12:00',
    assignedInspectorId: null,
    publishedAt: new Date('2026-05-01'),
    assignedAt: null,
    name: null,
    regionName: null,
    description: null,
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeGroupWithAppointments(
  groupOverrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
): ServiceGroupWithAppointments {
  const appointments = [
    { id: 'appt-1', status: 'AWAITING_INSPECTOR', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'property-1', serviceGroupId: 'group-1' },
    { id: 'appt-2', status: 'AWAITING_INSPECTOR', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'property-2', serviceGroupId: 'group-1' },
  ];
  return {
    group: makeGroup(groupOverrides),
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

describe('UnpublishServiceGroupUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let auditService: AuditService;
  let useCase: UnpublishServiceGroupUseCase;

  beforeEach(() => {
    serviceGroupRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      acceptOptimistic: vi.fn(),
      unpublishOptimistic: vi.fn().mockResolvedValue(1),
      findPublishedForInspector: vi.fn(),
      findPublishedOfferDetail: vi.fn(),
      countPublishedForInspector: vi.fn(),
      linkAppointments: vi.fn(),
      unlinkAppointments: vi.fn(),
      scheduleAppointments: vi.fn(),
      revertScheduledAppointments: vi.fn(),
      findExpiredPublished: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new UnpublishServiceGroupUseCase(serviceGroupRepo, auditService, authorizationService);
  });

  it('should move a PUBLISHED group back to DRAFT', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());

    const result = await useCase.execute({
      groupId: 'group-1',
      reason: 'Wrong time window, fixing before re-offering',
      actor: makeActor(),
    });

    expect(result).toEqual({ id: 'group-1', status: 'DRAFT' });
    expect(serviceGroupRepo.unpublishOptimistic).toHaveBeenCalledWith('group-1');
  });

  it('should not touch the member appointments', async () => {
    // The members are already AWAITING_INSPECTOR — the state a group has
    // between creation and publish — so unpublishing is a group-row-only write.
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());

    await useCase.execute({
      groupId: 'group-1',
      reason: 'Fixing the group before re-offering',
      actor: makeActor(),
    });

    expect(serviceGroupRepo.revertScheduledAppointments).not.toHaveBeenCalled();
    expect(serviceGroupRepo.unlinkAppointments).not.toHaveBeenCalled();
    expect(serviceGroupRepo.scheduleAppointments).not.toHaveBeenCalled();
  });

  it('should log an audit entry with the reason', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());

    await useCase.execute({
      groupId: 'group-1',
      reason: 'Region was wrong',
      actor: makeActor({ userId: 'op-user-1', role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.unpublished',
        actorType: 'USER',
        actorId: 'op-user-1',
        entityType: 'ServiceGroup',
        entityId: 'group-1',
        tenantId: 'tenant-1',
        before: expect.objectContaining({ status: 'PUBLISHED' }),
        after: expect.objectContaining({ status: 'DRAFT' }),
        reason: 'Region was wrong',
      }),
    );
  });

  it.each(['DRAFT', 'ACCEPTED', 'CANCELLED', 'REJECTED'] as const)(
    'should reject a %s group',
    async (status) => {
      vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments({ status }));

      await expect(
        useCase.execute({ groupId: 'group-1', reason: 'Some reason', actor: makeActor() }),
      ).rejects.toThrow(ServiceGroupInvalidStatusError);

      expect(serviceGroupRepo.unpublishOptimistic).not.toHaveBeenCalled();
    },
  );

  it('should throw GroupAlreadyAcceptedError when an inspector accepts first', async () => {
    // The optimistic write is the real guard: 0 rows means the status moved
    // away from PUBLISHED between the read and the write.
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());
    vi.mocked(serviceGroupRepo.unpublishOptimistic).mockResolvedValue(0);

    await expect(
      useCase.execute({ groupId: 'group-1', reason: 'Too late', actor: makeActor() }),
    ).rejects.toThrow(GroupAlreadyAcceptedError);

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should throw ServiceGroupNotFoundError when the group does not exist', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ groupId: 'nonexistent', reason: 'Some reason', actor: makeActor() }),
    ).rejects.toThrow(ServiceGroupNotFoundError);
  });

  it.each(['CL_ADMIN', 'CL_USER', 'INSP'] as const)('should reject %s role', async (role) => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        reason: 'Some reason',
        actor: makeActor({ role, tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it.each(['AM', 'OP'] as const)('should allow %s role', async (role) => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());

    const result = await useCase.execute({
      groupId: 'group-1',
      reason: 'Fixing the group',
      actor: makeActor({ role, tenantId: role === 'OP' ? 'tenant-1' : null }),
    });

    expect(result.status).toBe('DRAFT');
  });
});
