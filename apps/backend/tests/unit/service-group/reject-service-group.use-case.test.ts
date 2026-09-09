import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RejectServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/reject-service-group.use-case';
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
    publishedAt: null,
    assignedAt: null,
    name: null,
    regionName: null,
    description: null,
    serviceRegionId: null,
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

describe('RejectServiceGroupUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let auditService: AuditService;
  let useCase: RejectServiceGroupUseCase;

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
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new RejectServiceGroupUseCase(serviceGroupRepo, auditService, authorizationService);
  });

  it('should reject a PUBLISHED group: unlink members back to the map, clear inspector', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'PUBLISHED' }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      reason: 'Batch discarded',
      actor: makeActor(),
    });

    expect(result.status).toBe('REJECTED');
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      status: 'REJECTED',
      assignedInspectorId: null,
      assignedAt: null,
    });
    // Inspections leave the group and return to the map.
    expect(serviceGroupRepo.unlinkAppointments).toHaveBeenCalledWith('group-1');
  });

  it('should reject an ACCEPTED group: revert scheduled, then unlink', async () => {
    const callOrder: string[] = [];
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'ACCEPTED', assignedInspectorId: 'insp-1' }),
    );
    vi.mocked(serviceGroupRepo.revertScheduledAppointments).mockImplementation(async () => {
      callOrder.push('revert');
      return 2;
    });
    vi.mocked(serviceGroupRepo.update).mockImplementation(async () => {
      callOrder.push('update');
    });
    vi.mocked(serviceGroupRepo.unlinkAppointments).mockImplementation(async () => {
      callOrder.push('unlink');
    });

    const result = await useCase.execute({
      groupId: 'group-1',
      reason: 'Inspector cannot do it',
      actor: makeActor(),
    });

    expect(result.status).toBe('REJECTED');
    expect(serviceGroupRepo.revertScheduledAppointments).toHaveBeenCalledWith('group-1');
    expect(callOrder).toEqual(['revert', 'update', 'unlink']);
  });

  it.each(['DRAFT', 'CANCELLED', 'REJECTED'] as const)(
    'should refuse to reject a %s group',
    async (status) => {
      vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
        makeGroupWithAppointments({ status }),
      );

      await expect(
        useCase.execute({ groupId: 'group-1', reason: 'Nope', actor: makeActor() }),
      ).rejects.toThrow(ServiceGroupInvalidStatusError);

      expect(serviceGroupRepo.update).not.toHaveBeenCalled();
    },
  );

  it('should log audit with reason', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'PUBLISHED' }),
    );

    await useCase.execute({
      groupId: 'group-1',
      reason: 'Not viable',
      actor: makeActor({ userId: 'op-user-1', role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.rejected',
        actorId: 'op-user-1',
        entityId: 'group-1',
        tenantId: 'tenant-1',
        before: { status: 'PUBLISHED' },
        after: { status: 'REJECTED' },
        reason: 'Not viable',
      }),
    );
  });

  it('should reject non-AM/OP actors', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        reason: 'Forbidden',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ServiceGroupNotFoundError when group not found', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ groupId: 'nonexistent', reason: 'x', actor: makeActor() }),
    ).rejects.toThrow(ServiceGroupNotFoundError);
  });
});
