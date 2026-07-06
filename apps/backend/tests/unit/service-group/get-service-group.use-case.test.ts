import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/get-service-group.use-case';
import type { IServiceGroupRepository, ServiceGroupWithAppointments } from '../../../src/modules/service-group/domain/service-group.repository';
import type { AuthContext } from '@properfy/shared';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { deriveTenantFixture } from '../../helpers/service-group-fixtures';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { ServiceGroupNotFoundError } from '../../../src/modules/service-group/domain/service-group.errors';

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
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeGroupWithAppointments(
  groupOverrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
  appointments: ServiceGroupWithAppointments['appointments'] = [],
): ServiceGroupWithAppointments {
  const appts = appointments.length > 0
    ? appointments
    : [
        { id: 'appt-1', status: 'AWAITING_INSPECTOR', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'property-1', serviceGroupId: 'group-1' },
        { id: 'appt-2', status: 'AWAITING_INSPECTOR', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'property-2', serviceGroupId: 'group-1' },
      ];
  return {
    group: makeGroup(groupOverrides),
    assignedInspectorName: groupOverrides.assignedInspectorId ? 'Test Inspector' : null,
    appointments: appts,
    ...deriveTenantFixture(appts),
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

describe('GetServiceGroupUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let useCase: GetServiceGroupUseCase;

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
      findExpiredPublished: vi.fn(),
    };
    const auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new GetServiceGroupUseCase(serviceGroupRepo, authorizationService);
  });

  it('should return group with appointments for AM', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());

    const result = await useCase.execute({
      groupId: 'group-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.id).toBe('group-1');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.status).toBe('DRAFT');
    expect(result.appointments).toHaveLength(2);
    expect(result.appointments[0].id).toBe('appt-1');
    expect(result.appointments[0].propertyId).toBe('property-1');
    expect(serviceGroupRepo.findById).toHaveBeenCalledWith('group-1', null);
  });

  it('should expose serviceRegionId so the edit UI can pre-select the current region', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ serviceRegionId: 'region-42' }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.serviceRegionId).toBe('region-42');
  });

  it('should expose the sequential group code (groupNumber + code)', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ groupNumber: 1057 }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.groupNumber).toBe(1057);
    expect(result.code).toBe('1057');
  });

  it('should return group for OP', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());

    const result = await useCase.execute({
      groupId: 'group-1',
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(result.id).toBe('group-1');
    expect(serviceGroupRepo.findById).toHaveBeenCalledWith('group-1', 'tenant-1');
  });

  it('should reject CL_ADMIN', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ServiceGroupNotFoundError for missing group', async () => {
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        groupId: 'nonexistent',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(ServiceGroupNotFoundError);
  });

  it('should return all entity fields correctly', async () => {
    const publishedAt = new Date('2026-05-15');
    const assignedAt = new Date('2026-05-16');
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({
        status: 'ACCEPTED',
        offeredCount: 2,
        confirmedCount: 1,
        assignedInspectorId: 'insp-1',
        publishedAt,
        assignedAt,
      }),
    );

    const result = await useCase.execute({
      groupId: 'group-1',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.offeredCount).toBe(2);
    expect(result.confirmedCount).toBe(1);
    expect(result.assignedInspectorId).toBe('insp-1');
    expect(result.assignedInspectorName).toBe('Test Inspector');
    expect(result.publishedAt).toEqual(publishedAt);
    expect(result.assignedAt).toEqual(assignedAt);
    expect(result.createdByUserId).toBe('user-1');
  });
});
