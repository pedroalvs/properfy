import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext, ServiceTypeFlowType } from '@properfy/shared';
import {
  AutoGroupIngoingOutgoingService,
  pickRegion,
  type AutoGroupInput,
} from '../../../src/modules/service-group/application/services/auto-group-ingoing-outgoing.service';
import type { CreateServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/create-service-group.use-case';
import type { PublishServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/publish-service-group.use-case';
import type { IServiceRegionRepository, ResolvedRegion } from '../../../src/modules/service-region/domain/service-region.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import {
  ServiceRegionInactiveError,
  ServiceGroupTimeInPastError,
  ServiceGroupDateInPastError,
  ServiceGroupInvalidStatusError,
  ServiceRegionRequiredError,
  AppointmentAlreadyInGroupError,
} from '../../../src/modules/service-group/domain/service-group.errors';

const GROUP_ID = 'group-1';

function makeRegion(overrides: Partial<ResolvedRegion> = {}): ResolvedRegion {
  return {
    regionId: 'region-1',
    regionNumber: 1,
    regionName: 'Sydney CBD',
    color: '#3b82f6',
    matchedAppointmentIds: ['appt-1'],
    ...overrides,
  };
}

function makeInput(overrides: Partial<AutoGroupInput> = {}): AutoGroupInput {
  return {
    appointmentId: 'appt-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'svc-type-1',
    flowType: 'INGOING' as ServiceTypeFlowType,
    scheduledDate: '2026-09-01',
    timeSlotStart: '09:00',
    timeSlotEnd: '11:00',
    actor: {
      userId: 'user-cl-admin',
      tenantId: 'tenant-1',
      role: 'CL_ADMIN',
      branchId: null,
      inspectorId: null,
    } as AuthContext,
    ...overrides,
  };
}

describe('pickRegion', () => {
  it('returns undefined when nothing matched', () => {
    expect(pickRegion([])).toBeUndefined();
  });

  it('picks the lowest region number', () => {
    const picked = pickRegion([
      makeRegion({ regionId: 'r-9', regionNumber: 9 }),
      makeRegion({ regionId: 'r-2', regionNumber: 2 }),
      makeRegion({ regionId: 'r-7', regionNumber: 7 }),
    ]);

    expect(picked?.regionId).toBe('r-2');
  });

  // The whole reason region_number exists: with one appointment every matched
  // region ties at COUNT = 1, so the caller must not depend on arrival order.
  it('is stable regardless of the order the regions arrive in', () => {
    const regions = [
      makeRegion({ regionId: 'r-9', regionNumber: 9 }),
      makeRegion({ regionId: 'r-2', regionNumber: 2 }),
      makeRegion({ regionId: 'r-7', regionNumber: 7 }),
    ];

    expect(pickRegion([...regions].reverse())?.regionId).toBe('r-2');
    expect(pickRegion([regions[1], regions[0], regions[2]])?.regionId).toBe('r-2');
  });

  it('does not mutate the caller array', () => {
    const regions = [makeRegion({ regionNumber: 9 }), makeRegion({ regionNumber: 2 })];

    pickRegion(regions);

    expect(regions.map((r) => r.regionNumber)).toEqual([9, 2]);
  });
});

describe('AutoGroupIngoingOutgoingService', () => {
  let createServiceGroupUseCase: CreateServiceGroupUseCase;
  let publishServiceGroupUseCase: PublishServiceGroupUseCase;
  let serviceRegionRepo: IServiceRegionRepository;
  let auditService: AuditService;
  let logger: Logger;
  let service: AutoGroupIngoingOutgoingService;

  beforeEach(() => {
    createServiceGroupUseCase = {
      execute: vi.fn().mockResolvedValue({ id: GROUP_ID }),
    } as unknown as CreateServiceGroupUseCase;
    publishServiceGroupUseCase = {
      execute: vi.fn().mockResolvedValue({ id: GROUP_ID, status: 'PUBLISHED' }),
    } as unknown as PublishServiceGroupUseCase;
    serviceRegionRepo = {
      resolveRegionsForAppointments: vi.fn().mockResolvedValue([makeRegion()]),
    } as unknown as IServiceRegionRepository;
    auditService = { log: vi.fn() } as unknown as AuditService;
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

    service = new AutoGroupIngoingOutgoingService(
      createServiceGroupUseCase,
      publishServiceGroupUseCase,
      serviceRegionRepo,
      auditService,
      logger,
    );
  });

  describe('flow type gate', () => {
    it('skips ROUTINE entirely', async () => {
      const result = await service.tryAutoGroupAndPublish(makeInput({ flowType: 'ROUTINE' as ServiceTypeFlowType }));

      expect(result).toEqual({ kind: 'SKIPPED' });
      expect(serviceRegionRepo.resolveRegionsForAppointments).not.toHaveBeenCalled();
      expect(createServiceGroupUseCase.execute).not.toHaveBeenCalled();
      expect(publishServiceGroupUseCase.execute).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it.each(['INGOING', 'OUTGOING'] as const)('groups and publishes %s', async (flowType) => {
      const result = await service.tryAutoGroupAndPublish(
        makeInput({ flowType: flowType as ServiceTypeFlowType }),
      );

      expect(result).toEqual({ kind: 'PUBLISHED', groupId: GROUP_ID });
    });

    // Allowlist, not denylist. Publishing pushes work at inspectors, so an
    // unrecognised flow type must fall through to the manual path rather than
    // be treated as "not ROUTINE, therefore auto-publish".
    it.each([undefined, null, '', 'STANDARD', 'ingoing'])(
      'skips the unrecognised flow type %p instead of publishing it',
      async (flowType) => {
        const result = await service.tryAutoGroupAndPublish(
          makeInput({ flowType: flowType as unknown as ServiceTypeFlowType }),
        );

        expect(result).toEqual({ kind: 'SKIPPED' });
        expect(createServiceGroupUseCase.execute).not.toHaveBeenCalled();
        expect(publishServiceGroupUseCase.execute).not.toHaveBeenCalled();
      },
    );
  });

  describe('happy path', () => {
    it('resolves the region for exactly this appointment', async () => {
      await service.tryAutoGroupAndPublish(makeInput());

      expect(serviceRegionRepo.resolveRegionsForAppointments).toHaveBeenCalledWith(['appt-1']);
    });

    it('creates a single-appointment group whose window is the appointment slot', async () => {
      await service.tryAutoGroupAndPublish(makeInput());

      expect(createServiceGroupUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentIds: ['appt-1'],
          serviceTypeId: 'svc-type-1',
          scheduledDate: '2026-09-01',
          timeWindow: '09:00-11:00',
          serviceRegionId: 'region-1',
          skipTimeInPastCheck: true,
        }),
      );
    });

    // Keeping the real userId is what stops created_by_user_id violating its FK.
    it('elevates the actor to SYS while keeping the real user id', async () => {
      await service.tryAutoGroupAndPublish(makeInput());

      for (const useCase of [createServiceGroupUseCase, publishServiceGroupUseCase]) {
        expect(useCase.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            actor: expect.objectContaining({ role: 'SYS', userId: 'user-cl-admin' }),
          }),
        );
      }
    });

    it('publishes the group it just created', async () => {
      await service.tryAutoGroupAndPublish(makeInput());

      expect(publishServiceGroupUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: GROUP_ID }),
      );
    });

    // A published group is already traceable via service_group.created ->
    // appointment.status_transition -> service_group.published.
    it('writes no auto_group_incomplete audit entry', async () => {
      await service.tryAutoGroupAndPublish(makeInput());

      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('no region matched', () => {
    beforeEach(() => {
      vi.mocked(serviceRegionRepo.resolveRegionsForAppointments).mockResolvedValue([]);
    });

    it('creates the group without a region and leaves it DRAFT', async () => {
      const result = await service.tryAutoGroupAndPublish(makeInput());

      expect(result).toEqual({ kind: 'DRAFT', groupId: GROUP_ID, reason: 'NO_REGION_MATCH' });
      expect(createServiceGroupUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ serviceRegionId: null }),
      );
    });

    // Publishing would throw ServiceRegionRequiredError; not calling it keeps
    // the failure a deliberate outcome rather than a caught exception.
    it('does not attempt to publish', async () => {
      await service.tryAutoGroupAndPublish(makeInput());

      expect(publishServiceGroupUseCase.execute).not.toHaveBeenCalled();
    });

    it('audits the incomplete automation against the appointment', async () => {
      await service.tryAutoGroupAndPublish(makeInput());

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'appointment.auto_group_incomplete',
          actorType: 'SYSTEM',
          actorId: 'user-cl-admin',
          entityType: 'Appointment',
          entityId: 'appt-1',
          tenantId: 'tenant-1',
          metadata: expect.objectContaining({ reason: 'NO_REGION_MATCH', groupId: GROUP_ID }),
        }),
      );
    });
  });

  describe('region deactivated between resolve and create', () => {
    it('retries once without the region rather than losing the group', async () => {
      vi.mocked(createServiceGroupUseCase.execute)
        .mockRejectedValueOnce(new ServiceRegionInactiveError())
        .mockResolvedValueOnce({ id: GROUP_ID } as never);

      const result = await service.tryAutoGroupAndPublish(makeInput());

      expect(result).toEqual({ kind: 'DRAFT', groupId: GROUP_ID, reason: 'REGION_INACTIVE' });
      expect(createServiceGroupUseCase.execute).toHaveBeenCalledTimes(2);
      expect(vi.mocked(createServiceGroupUseCase.execute).mock.calls[1][0]).toEqual(
        expect.objectContaining({ serviceRegionId: null }),
      );
      expect(publishServiceGroupUseCase.execute).not.toHaveBeenCalled();
    });

    it('does not retry a second time if the region-less create also fails', async () => {
      vi.mocked(createServiceGroupUseCase.execute)
        .mockRejectedValueOnce(new ServiceRegionInactiveError())
        .mockRejectedValueOnce(new Error('boom'));

      const result = await service.tryAutoGroupAndPublish(makeInput());

      expect(result).toEqual({ kind: 'FAILED', reason: 'GROUP_CREATE_FAILED' });
      expect(createServiceGroupUseCase.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('publish refused — group survives as DRAFT', () => {
    it.each([
      [new ServiceGroupTimeInPastError(), 'TIME_IN_PAST'],
      [new ServiceGroupDateInPastError(), 'DATE_IN_PAST'],
      [new ServiceRegionInactiveError(), 'REGION_INACTIVE'],
      [new ServiceGroupInvalidStatusError('DRAFT', 'CANCELLED'), 'PUBLISH_FAILED'],
      [new ServiceRegionRequiredError(), 'PUBLISH_FAILED'],
    ])('maps %s to a DRAFT outcome', async (error, expectedReason) => {
      vi.mocked(publishServiceGroupUseCase.execute).mockRejectedValue(error);

      const result = await service.tryAutoGroupAndPublish(makeInput());

      expect(result).toEqual({ kind: 'DRAFT', groupId: GROUP_ID, reason: expectedReason });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'appointment.auto_group_incomplete',
          metadata: expect.objectContaining({ reason: expectedReason, groupId: GROUP_ID }),
        }),
      );
    });
  });

  describe('never throws', () => {
    // Appointment creation must not fail because the automation could not run.
    it('returns FAILED when the group cannot be created at all', async () => {
      vi.mocked(createServiceGroupUseCase.execute).mockRejectedValue(new AppointmentAlreadyInGroupError());

      const result = await service.tryAutoGroupAndPublish(makeInput());

      expect(result).toEqual({ kind: 'FAILED', reason: 'GROUP_CREATE_FAILED' });
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns FAILED when region resolution itself blows up', async () => {
      vi.mocked(serviceRegionRepo.resolveRegionsForAppointments).mockRejectedValue(new Error('db down'));

      const result = await service.tryAutoGroupAndPublish(makeInput());

      expect(result).toEqual({ kind: 'FAILED', reason: 'GROUP_CREATE_FAILED' });
      expect(createServiceGroupUseCase.execute).not.toHaveBeenCalled();
    });

    it('reports FAILED, not DRAFT, when no group was created', async () => {
      vi.mocked(createServiceGroupUseCase.execute).mockRejectedValue(new Error('boom'));

      const result = await service.tryAutoGroupAndPublish(makeInput());

      expect(result).toMatchObject({ kind: 'FAILED' });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ reason: 'GROUP_CREATE_FAILED', groupId: undefined }),
        }),
      );
    });
  });
});
