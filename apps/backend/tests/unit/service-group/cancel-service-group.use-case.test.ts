import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CancelServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/cancel-service-group.use-case';
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
    status: 'DRAFT',
    groupSize: 5,
    offeredCount: 0,
    confirmedCount: 0,
    scheduledDate: new Date('2026-06-01'),
    timeWindow: '09:00-12:00',
    assignedInspectorId: null,
    publishedAt: null,
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

describe('CancelServiceGroupUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let auditService: AuditService;
  let useCase: CancelServiceGroupUseCase;

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
      unlinkTerminalAppointments: vi.fn(),
      scheduleAppointments: vi.fn(),
      revertScheduledAppointments: vi.fn(),
      findExpiredPublished: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new CancelServiceGroupUseCase(serviceGroupRepo, auditService, authorizationService);
  });

  it('should cancel an ACCEPTED group: revert scheduled, clear inspector, keep members', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'ACCEPTED', assignedInspectorId: 'insp-1' }),
    );
    vi.mocked(serviceGroupRepo.revertScheduledAppointments).mockResolvedValue(2);

    const result = await useCase.execute({
      groupId: 'group-1',
      reason: 'Inspector unavailable',
      actor: makeActor(),
    });

    expect(result.id).toBe('group-1');
    expect(result.status).toBe('CANCELLED');
    // Scheduled visits are released back to AWAITING_INSPECTOR but stay linked.
    expect(serviceGroupRepo.revertScheduledAppointments).toHaveBeenCalledWith('group-1');
    // Group status flips to CANCELLED and the group-level inspector is cleared.
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      status: 'CANCELLED',
      assignedInspectorId: null,
      assignedAt: null,
    });
    // Live members must NOT be bulk-unlinked — Cancel keeps the batch so it can be republished.
    expect(serviceGroupRepo.unlinkAppointments).not.toHaveBeenCalled();
    // Only already-terminal members (e.g. a DONE visit) are detached.
    expect(serviceGroupRepo.unlinkTerminalAppointments).toHaveBeenCalledWith('group-1');
  });

  it('detaches terminal members but never bulk-unlinks the live batch', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'ACCEPTED', assignedInspectorId: 'insp-1' }),
    );

    await useCase.execute({
      groupId: 'group-1',
      reason: 'Partial batch already executed',
      actor: makeActor(),
    });

    expect(serviceGroupRepo.unlinkTerminalAppointments).toHaveBeenCalledWith('group-1');
    expect(serviceGroupRepo.unlinkAppointments).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'PUBLISHED', 'CANCELLED', 'REJECTED'] as const)(
    'should reject cancelling a %s group (only ACCEPTED can be cancelled)',
    async (status) => {
      vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
        makeGroupWithAppointments({ status }),
      );

      await expect(
        useCase.execute({
          groupId: 'group-1',
          reason: 'Not allowed',
          actor: makeActor(),
        }),
      ).rejects.toThrow(ServiceGroupInvalidStatusError);

      expect(serviceGroupRepo.update).not.toHaveBeenCalled();
    },
  );

  it('should reject non-AM/OP actors', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        reason: 'Forbidden',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP role', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        reason: 'Forbidden',
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ServiceGroupNotFoundError when group not found', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        groupId: 'nonexistent',
        reason: 'Does not exist',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupNotFoundError);
  });

  it('should log audit with reason', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'ACCEPTED', assignedInspectorId: 'insp-1' }),
    );

    await useCase.execute({
      groupId: 'group-1',
      reason: 'Client requested cancellation',
      actor: makeActor({ userId: 'op-user-1', role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.cancelled',
        actorType: 'USER',
        actorId: 'op-user-1',
        entityType: 'ServiceGroup',
        entityId: 'group-1',
        tenantId: 'tenant-1',
        before: { status: 'ACCEPTED' },
        after: { status: 'CANCELLED' },
        reason: 'Client requested cancellation',
      }),
    );
  });

  it('should revert scheduled appointments before updating the group', async () => {
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

    await useCase.execute({
      groupId: 'group-1',
      reason: 'Order check',
      actor: makeActor(),
    });

    expect(callOrder).toEqual(['revert', 'update']);
  });
});
