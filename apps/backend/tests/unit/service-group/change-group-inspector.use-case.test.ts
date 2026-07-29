import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeGroupInspectorUseCase } from '../../../src/modules/service-group/application/use-cases/change-group-inspector.use-case';
import type { IServiceGroupRepository, ServiceGroupWithAppointments } from '../../../src/modules/service-group/domain/service-group.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { deriveTenantFixture } from '../../helpers/service-group-fixtures';
import { ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { SERVICE_GROUP_EVENTS } from '../../../src/shared/application/events/domain-event-bus';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  InspectorInactiveError,
  InspectorIneligibleError,
  InspectorServiceTypeIneligibleError,
} from '../../../src/modules/service-group/domain/service-group.errors';

function makeGroup(
  overrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
): ServiceGroupEntity {
  return new ServiceGroupEntity({
    id: 'group-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'svc-type-1',
    status: 'ACCEPTED',
    groupSize: 2,
    offeredCount: 0,
    confirmedCount: 2,
    scheduledDate: new Date('2026-06-01'),
    timeWindow: '09:00-12:00',
    assignedInspectorId: 'insp-old',
    publishedAt: new Date('2026-05-01'),
    assignedAt: new Date('2026-05-02'),
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
    { id: 'appt-1', status: 'SCHEDULED', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'property-1', serviceGroupId: 'group-1' },
    { id: 'appt-2', status: 'SCHEDULED', serviceTypeId: 'svc-type-1', tenantId: 'tenant-1', propertyId: 'property-2', serviceGroupId: 'group-1' },
  ];
  return {
    group: makeGroup(groupOverrides),
    appointments,
    ...deriveTenantFixture(appointments),
  } as unknown as ServiceGroupWithAppointments;
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, ...overrides };
}

function makeInspector(overrides: Record<string, unknown> = {}) {
  return {
    id: 'insp-new',
    isActive: () => true,
    supportsServiceType: () => true,
    isEligibleForTenant: () => true,
    ...overrides,
  };
}

const INPUT = { groupId: 'group-1', inspectorId: 'insp-new', reason: 'Original inspector unavailable' };

function setup(options: {
  group?: ServiceGroupWithAppointments | null;
  inspector?: unknown;
  coveredPropertyIds?: string[];
  cached?: unknown;
} = {}) {
  const serviceGroupRepo = {
    findById: vi.fn().mockResolvedValue(options.group === undefined ? makeGroupWithAppointments() : options.group),
    update: vi.fn().mockResolvedValue(undefined),
    assignInspectorToGroupAppointments: vi.fn().mockResolvedValue({ reassigned: 2, scheduled: 0 }),
    scheduleAppointments: vi.fn(),
    revertScheduledAppointments: vi.fn(),
  } as unknown as IServiceGroupRepository;

  const inspectorRepo = {
    findById: vi.fn().mockResolvedValue(options.inspector === undefined ? makeInspector() : options.inspector),
  };
  const serviceRegionRepo = {
    findPropertyIdsInInspectorRegions: vi
      .fn()
      .mockResolvedValue(options.coveredPropertyIds ?? ['property-1', 'property-2']),
  };
  const auditService = { log: vi.fn() } as unknown as AuditService;
  const idempotencyService = {
    get: vi.fn().mockResolvedValue(options.cached ?? null),
    set: vi.fn().mockResolvedValue(undefined),
  };
  const eventBus = { emit: vi.fn() };

  const useCase = new ChangeGroupInspectorUseCase(
    serviceGroupRepo,
    inspectorRepo as never,
    serviceRegionRepo as never,
    auditService,
    new AuthorizationService(auditService),
    idempotencyService as never,
    eventBus as never,
  );

  return { useCase, serviceGroupRepo, inspectorRepo, serviceRegionRepo, auditService, idempotencyService, eventBus };
}

describe('ChangeGroupInspectorUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('authorization and lookup', () => {
    it.each(['CL_ADMIN', 'CL_USER', 'INSP'] as const)('rejects %s actors', async (role) => {
      const { useCase } = setup();
      await expect(useCase.execute({ ...INPUT, actor: makeActor({ role, tenantId: 'tenant-1' }) })).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('throws when the group does not exist', async () => {
      const { useCase } = setup({ group: null });
      await expect(useCase.execute({ ...INPUT, actor: makeActor() })).rejects.toThrow(ServiceGroupNotFoundError);
    });

    it('throws when the inspector does not exist', async () => {
      const { useCase } = setup({ inspector: null });
      await expect(useCase.execute({ ...INPUT, actor: makeActor() })).rejects.toThrow(NotFoundError);
    });
  });

  describe('status gating', () => {
    it.each(['DRAFT', 'PUBLISHED', 'ACCEPTED'] as const)('allows %s groups', async (status) => {
      const { useCase } = setup({ group: makeGroupWithAppointments({ status, assignedInspectorId: status === 'ACCEPTED' ? 'insp-old' : null }) });
      await expect(useCase.execute({ ...INPUT, actor: makeActor() })).resolves.toMatchObject({ status: 'ACCEPTED' });
    });

    it.each(['CANCELLED', 'REJECTED'] as const)('rejects %s groups', async (status) => {
      const { useCase } = setup({ group: makeGroupWithAppointments({ status }) });
      await expect(useCase.execute({ ...INPUT, actor: makeActor() })).rejects.toThrow(ServiceGroupInvalidStatusError);
    });
  });

  describe('eligibility', () => {
    it('rejects an inactive inspector', async () => {
      const { useCase } = setup({ inspector: makeInspector({ isActive: () => false }) });
      await expect(useCase.execute({ ...INPUT, actor: makeActor() })).rejects.toThrow(InspectorInactiveError);
    });

    it('rejects an inspector who does not support the service type', async () => {
      const { useCase } = setup({ inspector: makeInspector({ supportsServiceType: () => false }) });
      await expect(useCase.execute({ ...INPUT, actor: makeActor() })).rejects.toThrow(InspectorServiceTypeIneligibleError);
    });

    it('rejects an inspector blocked by one of the agencies', async () => {
      const { useCase } = setup({ inspector: makeInspector({ isEligibleForTenant: () => false }) });
      await expect(useCase.execute({ ...INPUT, actor: makeActor() })).rejects.toThrow(InspectorIneligibleError);
    });

    it('rejects an inspector whose regions do not cover every property', async () => {
      const { useCase } = setup({ coveredPropertyIds: ['property-1'] });
      await expect(useCase.execute({ ...INPUT, actor: makeActor() })).rejects.toThrow(InspectorIneligibleError);
    });
  });

  describe('reassignment', () => {
    it('swaps the inspector across members without reverting their status', async () => {
      const { useCase, serviceGroupRepo } = setup();

      const result = await useCase.execute({ ...INPUT, actor: makeActor() });

      expect(serviceGroupRepo.assignInspectorToGroupAppointments).toHaveBeenCalledWith('group-1', 'insp-new');
      expect(serviceGroupRepo.revertScheduledAppointments).not.toHaveBeenCalled();
      expect(serviceGroupRepo.scheduleAppointments).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        assignedInspectorId: 'insp-new',
        previousInspectorId: 'insp-old',
        appointmentsReassigned: 2,
        appointmentsScheduled: 0,
      });
    });

    it('marks the group ACCEPTED and syncs confirmedCount to the members it now owns', async () => {
      const { useCase, serviceGroupRepo } = setup();

      await useCase.execute({ ...INPUT, actor: makeActor() });

      expect(serviceGroupRepo.update).toHaveBeenCalledWith(
        'group-1',
        expect.objectContaining({ status: 'ACCEPTED', assignedInspectorId: 'insp-new' }),
      );
      expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', { confirmedCount: 2 });
    });

    it('is a no-op when the group already belongs to that inspector', async () => {
      const { useCase, serviceGroupRepo, auditService, eventBus } = setup({
        group: makeGroupWithAppointments({ status: 'ACCEPTED', assignedInspectorId: 'insp-new' }),
      });

      const result = await useCase.execute({ ...INPUT, actor: makeActor() });

      expect(serviceGroupRepo.update).not.toHaveBeenCalled();
      expect(serviceGroupRepo.assignInspectorToGroupAppointments).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
      expect(result).toMatchObject({ assignedInspectorId: 'insp-new', previousInspectorId: 'insp-new' });
    });
  });

  describe('audit and events', () => {
    it('records the previous inspector and the operator reason', async () => {
      const { useCase, auditService } = setup();

      await useCase.execute({ ...INPUT, actor: makeActor() });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'service_group.inspector_changed',
          entityId: 'group-1',
          reason: 'Original inspector unavailable',
          metadata: expect.objectContaining({ previousInspectorId: 'insp-old', initiatedBy: 'AM', groupStatus: 'ACCEPTED' }),
        }),
      );
    });

    it('emits only INSPECTOR_CHANGED when the group was already accepted', async () => {
      const { useCase, eventBus } = setup();

      await useCase.execute({ ...INPUT, actor: makeActor() });

      const types = eventBus.emit.mock.calls.map((c) => c[0].type);
      expect(types).toEqual([SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED]);
    });

    it('also emits MANUALLY_ASSIGNED on first assignment so rental tenants get their notice', async () => {
      const { useCase, eventBus } = setup({
        group: makeGroupWithAppointments({ status: 'PUBLISHED', assignedInspectorId: null }),
      });

      await useCase.execute({ ...INPUT, actor: makeActor() });

      const types = eventBus.emit.mock.calls.map((c) => c[0].type);
      expect(types).toContain(SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED);
      expect(types).toContain(SERVICE_GROUP_EVENTS.MANUALLY_ASSIGNED);
    });
  });

  describe('idempotency', () => {
    it('replays a cached result when the caller supplied a key', async () => {
      const cached = { id: 'group-1', status: 'ACCEPTED', assignedInspectorId: 'insp-new', previousInspectorId: 'insp-old', appointmentsReassigned: 2, appointmentsScheduled: 0 };
      const { useCase, serviceGroupRepo } = setup({ cached });

      const result = await useCase.execute({ ...INPUT, actor: makeActor(), idempotencyKey: 'key-1' });

      expect(result).toEqual(cached);
      expect(serviceGroupRepo.update).not.toHaveBeenCalled();
    });

    it('checks authorization before replaying — a key is not a capability', async () => {
      const cached = { id: 'group-1', status: 'ACCEPTED', assignedInspectorId: 'insp-new', previousInspectorId: 'insp-old', appointmentsReassigned: 2, appointmentsScheduled: 0 };
      const { useCase, idempotencyService } = setup({ cached });

      await expect(
        useCase.execute({
          ...INPUT,
          actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
          idempotencyKey: 'key-1',
        }),
      ).rejects.toThrow(ForbiddenError);

      expect(idempotencyService.get).not.toHaveBeenCalled();
    });

    it('never synthesizes a key, so swapping back to a previous inspector still runs', async () => {
      const { useCase, idempotencyService, serviceGroupRepo } = setup();

      await useCase.execute({ ...INPUT, actor: makeActor() });

      expect(idempotencyService.get).not.toHaveBeenCalled();
      expect(idempotencyService.set).not.toHaveBeenCalled();
      expect(serviceGroupRepo.assignInspectorToGroupAppointments).toHaveBeenCalled();
    });
  });
});
