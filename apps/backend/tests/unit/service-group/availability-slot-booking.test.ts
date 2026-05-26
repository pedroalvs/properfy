import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssignInspectorManuallyUseCase } from '../../../src/modules/service-group/application/use-cases/assign-inspector-manually.use-case';
import { CancelServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/cancel-service-group.use-case';
import type { IServiceGroupRepository } from '../../../src/modules/service-group/domain/service-group.repository';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { IAvailabilitySlotRepository } from '../../../src/modules/inspector/domain/availability-slot.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { AvailabilitySlotEntity } from '../../../src/modules/inspector/domain/availability-slot.entity';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

// --- Helpers ---

function makeGroup(overrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {}): ServiceGroupEntity {
  return new ServiceGroupEntity({
    id: 'group-1',
    tenantId: 'tenant-1',
    serviceTypeId: 'svc-type-1',
    status: 'PUBLISHED',
    groupSize: 5,
    offeredCount: 1,
    confirmedCount: 0,
    scheduledDate: new Date('2026-04-01'),
    timeWindow: '08:00-12:00',
    name: null,
    regionName: null,
    description: null,
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
    assignedInspectorId: null,
    publishedAt: new Date(),
    assignedAt: null,
    createdByUserId: 'user-op',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeInspector(overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {}): InspectorEntity {
  return new InspectorEntity({
    id: 'inspector-1',
    userId: null,
    name: 'John Inspector',
    email: 'john@inspectors.com',
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [{ serviceTypeId: 'svc-type-1', certified: false }],
    clientEligibilityJson: [{ tenantId: 'tenant-1', eligible: true }],
    blockedClientsJson: [],
    fullName: null,
    address: null,
    abn: null,
    dateOfBirth: null,
    insuranceFileKey: null,
    insuranceExpiresAt: null,
    policeCheckFileKey: null,
    policeCheckExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeSlot(overrides: Partial<ConstructorParameters<typeof AvailabilitySlotEntity>[0]> = {}): AvailabilitySlotEntity {
  return new AvailabilitySlotEntity({
    id: 'slot-1',
    inspectorId: 'inspector-1',
    date: new Date('2026-04-01'),
    startTime: '08:00',
    endTime: '12:00',
    regionJson: null,
    capacity: 3,
    status: 'AVAILABLE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeGroupWithAppointments(
  groupOverrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
  appointmentCount = 5,
) {
  const group = makeGroup(groupOverrides);
  const appointments = Array.from({ length: appointmentCount }, (_, i) => ({
    id: `appt-${i + 1}`,
    appointmentNumber: i + 1,
    status: 'AWAITING_INSPECTOR',
    serviceTypeId: 'svc-type-1',
    tenantId: 'tenant-1',
    propertyId: `prop-${i + 1}`,
    serviceGroupId: group.id,
  }));
  return { group, appointments };
}

function makeAmActor(): AuthContext {
  return {
    userId: 'user-am',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
  };
}

function makeAvailabilitySlotRepo(): IAvailabilitySlotRepository {
  return {
    findById: vi.fn(),
    findByIdAny: vi.fn(),
    findByDateRange: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    findMatchingSlot: vi.fn(),
    decrementCapacity: vi.fn(),
    incrementCapacity: vi.fn(),
    findSlotForRestore: vi.fn(),
  };
}

function makeServiceGroupRepo(): IServiceGroupRepository {
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
    scheduleAppointments: vi.fn(),
    revertScheduledAppointments: vi.fn(),
    findExpiredPublished: vi.fn(),
  };
}

function makeInspectorRepo(): IInspectorRepository {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByUserId: vi.fn(),
    linkUserId: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    findByRegionId: vi.fn(),
  };
}

function makeIdempotencyService() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    getWithHash: vi.fn().mockResolvedValue(null),
  };
}

// --- Tests ---

describe('GAP-003: Availability slot booking integration', () => {
  describe('AssignInspectorManuallyUseCase – slot booking', () => {
    let serviceGroupRepo: IServiceGroupRepository;
    let inspectorRepo: IInspectorRepository;
    let serviceRegionRepo: IServiceRegionRepository;
    let auditService: AuditService;
    let idempotencyService: ReturnType<typeof makeIdempotencyService>;
    let slotRepo: IAvailabilitySlotRepository;

    beforeEach(() => {
      serviceGroupRepo = makeServiceGroupRepo();
      inspectorRepo = makeInspectorRepo();
      serviceRegionRepo = {
        findById: vi.fn(),
        findByName: vi.fn().mockResolvedValue(null),
        findAll: vi.fn(),
        count: vi.fn(),
        save: vi.fn(),
        update: vi.fn(),
        findPropertyIdsInInspectorRegions: vi.fn().mockResolvedValue(['prop-1', 'prop-2', 'prop-3', 'prop-4', 'prop-5']),
        resolveRegionsForAppointments: vi.fn().mockResolvedValue([]),
        findContainingPoint: vi.fn().mockResolvedValue([]),
      countPublishedGroupsByRegionId: vi.fn().mockResolvedValue(0),
        countActiveInspectorsInRegion: vi.fn().mockResolvedValue(0),
        setInspectorRegions: vi.fn(),
        getInspectorRegionIds: vi.fn().mockResolvedValue([]),
        getInspectorRegionIdsBatch: vi.fn().mockResolvedValue(new Map()),
        delete: vi.fn(),
      };
      auditService = { log: vi.fn() } as unknown as AuditService;
      idempotencyService = makeIdempotencyService();
      slotRepo = makeAvailabilitySlotRepo();
    });

    it('should assign successfully even when no matching slot exists (slots are informational)', async () => {
      const useCase = new AssignInspectorManuallyUseCase(
        serviceGroupRepo, inspectorRepo, auditService, serviceRegionRepo,
        idempotencyService, new AuthorizationService(auditService), undefined, slotRepo,
      );

      vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());
      vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
      vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);

      const result = await useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeAmActor(),
      });

      expect(result.status).toBe('ACCEPTED');
      expect(slotRepo.findMatchingSlot).not.toHaveBeenCalled();
      expect(slotRepo.decrementCapacity).not.toHaveBeenCalled();
    });
  });

  describe('CancelServiceGroupUseCase – slot restoration', () => {
    let serviceGroupRepo: IServiceGroupRepository;
    let auditService: AuditService;
    let slotRepo: IAvailabilitySlotRepository;

    beforeEach(() => {
      serviceGroupRepo = makeServiceGroupRepo();
      auditService = { log: vi.fn() } as unknown as AuditService;
      slotRepo = makeAvailabilitySlotRepo();
    });

    it('should restore slot capacity when cancelling an ACCEPTED group', async () => {
      const useCase = new CancelServiceGroupUseCase(
        serviceGroupRepo, auditService, new AuthorizationService(auditService), undefined, slotRepo,
      );

      vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
        makeGroupWithAppointments({
          status: 'ACCEPTED',
          assignedInspectorId: 'inspector-1',
        }),
      );
      vi.mocked(serviceGroupRepo.revertScheduledAppointments).mockResolvedValue(5);
      vi.mocked(slotRepo.findSlotForRestore).mockResolvedValue(makeSlot({ capacity: 0 }));

      await useCase.execute({
        groupId: 'group-1',
        reason: 'Inspector unavailable',
        actor: makeAmActor(),
      });

      expect(slotRepo.findSlotForRestore).toHaveBeenCalledWith(
        'inspector-1',
        new Date('2026-04-01'),
        '08:00',
        '12:00',
      );
      expect(slotRepo.incrementCapacity).toHaveBeenCalledWith('slot-1');
    });

    it('should not attempt slot restoration when cancelling a DRAFT group', async () => {
      const useCase = new CancelServiceGroupUseCase(
        serviceGroupRepo, auditService, new AuthorizationService(auditService), undefined, slotRepo,
      );

      vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
        makeGroupWithAppointments({ status: 'DRAFT' }),
      );

      await useCase.execute({
        groupId: 'group-1',
        reason: 'No longer needed',
        actor: makeAmActor(),
      });

      expect(slotRepo.findSlotForRestore).not.toHaveBeenCalled();
      expect(slotRepo.incrementCapacity).not.toHaveBeenCalled();
    });

    it('should not attempt slot restoration when cancelling a PUBLISHED group', async () => {
      const useCase = new CancelServiceGroupUseCase(
        serviceGroupRepo, auditService, new AuthorizationService(auditService), undefined, slotRepo,
      );

      vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
        makeGroupWithAppointments({ status: 'PUBLISHED' }),
      );

      await useCase.execute({
        groupId: 'group-1',
        reason: 'Cancelled before acceptance',
        actor: makeAmActor(),
      });

      expect(slotRepo.findSlotForRestore).not.toHaveBeenCalled();
      expect(slotRepo.incrementCapacity).not.toHaveBeenCalled();
    });

    it('should gracefully handle missing slot on restoration (no error)', async () => {
      const useCase = new CancelServiceGroupUseCase(
        serviceGroupRepo, auditService, new AuthorizationService(auditService), undefined, slotRepo,
      );

      vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
        makeGroupWithAppointments({
          status: 'ACCEPTED',
          assignedInspectorId: 'inspector-1',
        }),
      );
      vi.mocked(serviceGroupRepo.revertScheduledAppointments).mockResolvedValue(5);
      vi.mocked(slotRepo.findSlotForRestore).mockResolvedValue(null);

      // Should not throw even when no matching slot is found
      const result = await useCase.execute({
        groupId: 'group-1',
        reason: 'Inspector slot was deleted',
        actor: makeAmActor(),
      });

      expect(result.status).toBe('CANCELLED');
      expect(slotRepo.incrementCapacity).not.toHaveBeenCalled();
    });
  });
});
