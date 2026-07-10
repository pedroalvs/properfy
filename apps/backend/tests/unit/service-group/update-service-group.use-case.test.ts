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
} from '../../../src/modules/service-group/domain/service-group.errors';
import { futureDateStr } from '../../helpers/date-fixtures';
import { deriveTenantFixture } from '../../helpers/service-group-fixtures';

// `FUTURE_DATE` is used both as input and as the expected repo-call date.
// Keeping them in a single constant means we can't get them out of sync when
// the clock moves.
const FUTURE_DATE = futureDateStr(120);
const FAR_FUTURE_DATE = futureDateStr(150);

function makeGroupProps(overrides: Partial<ServiceGroupProps> = {}): ServiceGroupProps {
  return {
    id: 'group-1',
    serviceTypeId: 'svc-type-1',
    status: 'DRAFT',
    groupSize: 5,
    offeredCount: 0,
    confirmedCount: 0,
    scheduledDate: new Date('2026-06-01'),
    timeWindow: '09:00-12:00',
    regionName: null,
    description: null,
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
  // resolves to 'tenant-1'.
  const appointments = [
    { id: 'appt-1', status: 'AWAITING_INSPECTOR', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'property-1', serviceGroupId: 'group-1', scheduledDate: new Date('2026-06-01') },
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
  };
}

describe('UpdateServiceGroupUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let appointmentRepo: { update: ReturnType<typeof vi.fn> };
  let auditService: AuditService;
  let useCase: UpdateServiceGroupUseCase;

  beforeEach(() => {
    serviceGroupRepo = makeRepo();
    appointmentRepo = { update: vi.fn() };
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new UpdateServiceGroupUseCase(
      serviceGroupRepo,
      auditService,
      authorizationService,
      appointmentRepo as any,
      { error: vi.fn() },
    );
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

  it('re-schedules member appointments to the new group date', async () => {
    const groupData = makeGroupWithAppointments({ status: 'DRAFT' });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);

    await useCase.execute({
      groupId: 'group-1',
      scheduledDate: FUTURE_DATE,
      actor: makeActor(),
    });

    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      scheduledDate: new Date(FUTURE_DATE),
    });
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.updated',
      entityId: 'appt-1',
      before: { scheduledDate: new Date('2026-06-01') },
      after: { scheduledDate: new Date(FUTURE_DATE) },
      reason: 'Service group date changed',
      metadata: expect.objectContaining({ groupId: 'group-1', automaticDateSync: true }),
    }));
  });

  it('does not touch members when scheduledDate is not part of the update', async () => {
    const groupData = makeGroupWithAppointments({ status: 'DRAFT' });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);

    await useCase.execute({
      groupId: 'group-1',
      description: 'New description',
      actor: makeActor(),
    });

    expect(appointmentRepo.update).not.toHaveBeenCalled();
  });

  it('keeps the group update when a member date sync fails (best-effort)', async () => {
    const groupData = makeGroupWithAppointments({ status: 'DRAFT' });
    vi.mocked(serviceGroupRepo.findById)
      .mockResolvedValueOnce(groupData)
      .mockResolvedValueOnce(groupData);
    appointmentRepo.update.mockRejectedValueOnce(new Error('db down'));

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
