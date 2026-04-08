import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RepublishServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/republish-service-group.use-case';
import type { IServiceGroupRepository, ServiceGroupWithAppointments } from '../../../src/modules/service-group/domain/service-group.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
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
    status: 'CANCELLED',
    groupSize: 5,
    offeredCount: 1,
    confirmedCount: 0,
    scheduledDate: new Date('2026-06-01'),
    timeWindow: '09:00-12:00',
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
    assignedInspectorId: null,
    publishedAt: null,
    assignedAt: null,
    name: null,
    regionName: null,
    description: null,
    exceptionType: null,
    exceptionReason: null,
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
  return {
    group: makeGroup(groupOverrides),
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

describe('RepublishServiceGroupUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let auditService: AuditService;
  let useCase: RepublishServiceGroupUseCase;

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
    useCase = new RepublishServiceGroupUseCase(serviceGroupRepo, auditService);
  });

  it('should republish a CANCELLED group to DRAFT', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'CANCELLED', assignedInspectorId: 'insp-1' }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      reason: 'Re-evaluate and republish',
      actor: makeActor(),
    });

    expect(result.id).toBe('group-1');
    expect(result.status).toBe('DRAFT');
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      status: 'DRAFT',
      assignedInspectorId: null,
      assignedAt: null,
      priorityExpiresAt: null,
      publishedAt: null,
    });
  });

  it('should log audit with reason when provided', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'CANCELLED' }),
    );

    await useCase.execute({
      groupId: 'group-1',
      reason: 'Client wants to retry',
      actor: makeActor({ userId: 'op-user-1', role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.republished',
        actorType: 'USER',
        actorId: 'op-user-1',
        entityType: 'ServiceGroup',
        entityId: 'group-1',
        tenantId: 'tenant-1',
        before: expect.objectContaining({ status: 'CANCELLED' }),
        after: expect.objectContaining({ status: 'DRAFT', assignedInspectorId: null, priorityExpiresAt: null }),
        reason: 'Client wants to retry',
      }),
    );
  });

  it('should log audit without reason when not provided', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'CANCELLED' }),
    );

    await useCase.execute({
      groupId: 'group-1',
      actor: makeActor(),
    });

    const logCall = vi.mocked(auditService.log).mock.calls[0][0];
    expect(logCall).not.toHaveProperty('reason');
  });

  it('should reject non-CANCELLED group (DRAFT)', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'DRAFT' }),
    );

    await expect(
      useCase.execute({
        groupId: 'group-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupInvalidStatusError);
  });

  it('should reject non-CANCELLED group (PUBLISHED)', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'PUBLISHED' }),
    );

    await expect(
      useCase.execute({
        groupId: 'group-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupInvalidStatusError);
  });

  it('should reject non-CANCELLED group (ACCEPTED)', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'ACCEPTED' }),
    );

    await expect(
      useCase.execute({
        groupId: 'group-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupInvalidStatusError);
  });

  it('should reject CL_ADMIN role', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP role', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject CL_USER role', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ServiceGroupNotFoundError when group not found', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        groupId: 'nonexistent',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupNotFoundError);
  });

  it('should allow AM role', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'CANCELLED' }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.status).toBe('DRAFT');
  });

  it('should allow OP role', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'CANCELLED' }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(result.status).toBe('DRAFT');
  });

  it('should clear assignedInspectorId and priorityExpiresAt', async () => {
    const expiresAt = new Date('2026-05-30');
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({
        status: 'CANCELLED',
        assignedInspectorId: 'insp-42',
        priorityExpiresAt: expiresAt,
      }),
    );

    await useCase.execute({
      groupId: 'group-1',
      actor: makeActor(),
    });

    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', expect.objectContaining({
      assignedInspectorId: null,
      priorityExpiresAt: null,
      publishedAt: null,
      assignedAt: null,
    }));
  });
});
