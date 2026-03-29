import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublishServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/publish-service-group.use-case';
import type { IServiceGroupRepository, ServiceGroupWithAppointments } from '../../../src/modules/service-group/domain/service-group.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  AppointmentInvalidStatusError,
  PriorityExpiredError,
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
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
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
  appointments?: ServiceGroupWithAppointments['appointments'],
): ServiceGroupWithAppointments {
  return {
    group: makeGroup(groupOverrides),
    appointments: appointments ?? [
      { id: 'appt-1', status: 'AWAITING_INSPECTOR', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'property-1', serviceGroupId: 'group-1' },
      { id: 'appt-2', status: 'AWAITING_INSPECTOR', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'property-2', serviceGroupId: 'group-1' },
    ],
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

describe('PublishServiceGroupUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let auditService: AuditService;
  let useCase: PublishServiceGroupUseCase;

  beforeEach(() => {
    serviceGroupRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      acceptOptimistic: vi.fn(),
      findPublishedForInspector: vi.fn(),
      countPublishedForInspector: vi.fn(),
      linkAppointments: vi.fn(),
      unlinkAppointments: vi.fn(),
      scheduleAppointments: vi.fn(),
      revertScheduledAppointments: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new PublishServiceGroupUseCase(serviceGroupRepo, auditService);
  });

  it('should publish a DRAFT group successfully', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());

    const result = await useCase.execute({
      groupId: 'group-1',
      actor: makeActor(),
    });

    expect(result.id).toBe('group-1');
    expect(result.status).toBe('PUBLISHED');
    expect(result.publishedAt).toBeInstanceOf(Date);
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      status: 'PUBLISHED',
      offeredCount: 1,
      publishedAt: expect.any(Date),
    });
  });

  it('should increment offeredCount', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ offeredCount: 2 }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      actor: makeActor(),
    });

    expect(result.offeredCount).toBe(3);
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', expect.objectContaining({
      offeredCount: 3,
    }));
  });

  it('should reject non-AM/OP actors', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
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

  it('should return idempotent success for PUBLISHED group', async () => {
    const publishedAt = new Date('2026-03-20');
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'PUBLISHED', offeredCount: 2, publishedAt }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      actor: makeActor(),
    });

    expect(result.id).toBe('group-1');
    expect(result.status).toBe('PUBLISHED');
    expect(result.offeredCount).toBe(2);
    expect(result.publishedAt).toBe(publishedAt);
    expect(serviceGroupRepo.update).not.toHaveBeenCalled();
  });

  it('should reject ACCEPTED group', async () => {
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

  it('should reject when appointment has changed status', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({}, [
        { id: 'appt-1', status: 'AWAITING_INSPECTOR', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'property-1', serviceGroupId: 'group-1' },
        { id: 'appt-2', status: 'CANCELLED', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'property-2', serviceGroupId: 'group-1' },
      ]),
    );

    await expect(
      useCase.execute({
        groupId: 'group-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentInvalidStatusError);
  });

  it('should reject when priority has expired', async () => {
    const expiredDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({
        priorityMode: 'PRIORITY_24H',
        priorityExpiresAt: expiredDate,
      }),
    );

    await expect(
      useCase.execute({
        groupId: 'group-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(PriorityExpiredError);
  });

  it('should call audit log with correct before/after', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ offeredCount: 1 }),
    );

    await useCase.execute({
      groupId: 'group-1',
      actor: makeActor({ userId: 'op-user-1', role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.published',
        actorType: 'USER',
        actorId: 'op-user-1',
        entityType: 'ServiceGroup',
        entityId: 'group-1',
        tenantId: 'tenant-1',
        before: { status: 'DRAFT', offeredCount: 1 },
        after: { status: 'PUBLISHED', offeredCount: 2 },
      }),
    );
  });

  it('should allow OP to publish', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());

    const result = await useCase.execute({
      groupId: 'group-1',
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(result.status).toBe('PUBLISHED');
  });
});
