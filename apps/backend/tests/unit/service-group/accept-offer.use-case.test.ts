import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcceptOfferUseCase } from '../../../src/modules/service-group/application/use-cases/accept-offer.use-case';
import type { IServiceGroupRepository } from '../../../src/modules/service-group/domain/service-group.repository';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { deriveTenantFixture } from '../../helpers/service-group-fixtures';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  GroupAlreadyAcceptedError,
  InspectorIneligibleError,
  InspectorServiceTypeIneligibleError,
  InspectorInactiveError,
} from '../../../src/modules/service-group/domain/service-group.errors';
import type { IAvailabilitySlotRepository } from '../../../src/modules/inspector/domain/availability-slot.repository';

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
    name: 'John Inspector',
    email: 'john@inspectors.com',
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [{ serviceTypeId: 'svc-type-1', certified: false }],
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

function makeGroupWithAppointments(
  groupOverrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
  appointmentCount = 5,
) {
  const group = makeGroup(groupOverrides);
  const appointments = Array.from({ length: appointmentCount }, (_, i) => ({
    id: `appt-${i + 1}`,
    status: 'AWAITING_INSPECTOR',
    serviceTypeId: 'svc-type-1',
    tenantId: 'tenant-1',
    propertyId: `prop-${i + 1}`,
    serviceGroupId: group.id,
  }));
  return { group, appointments, ...deriveTenantFixture(appointments) };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-insp',
    tenantId: null,
    role: 'INSP',
    branchId: null,
    inspectorId: 'insp-1',
    ...overrides,
  };
}

describe('AcceptOfferUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let inspectorRepo: IInspectorRepository;
  let auditService: AuditService;
  let idempotencyService: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  let useCase: AcceptOfferUseCase;

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
      // Eligible by default; the region-rejection case overrides it.
      isGroupEligibleForInspector: vi.fn().mockResolvedValue(true),
      findEarlyAccessStateForGroup: vi.fn(),
      linkAppointments: vi.fn(),
      unlinkAppointments: vi.fn(),
      scheduleAppointments: vi.fn(),
      revertScheduledAppointments: vi.fn(),
      findExpiredPublished: vi.fn(),
    } as unknown as IServiceGroupRepository;
    inspectorRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findByRegionId: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    idempotencyService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    const authorizationService = new AuthorizationService(auditService);
    useCase = new AcceptOfferUseCase(
      serviceGroupRepo,
      inspectorRepo,
      auditService,
      idempotencyService,
      authorizationService,
    );
  });

  it('should return cached result on duplicate call (idempotency)', async () => {
    const cachedResult = {
      groupId: 'group-1',
      status: 'ACCEPTED',
      assignedInspectorId: 'inspector-1',
      appointmentsScheduled: 5,
      acceptedAt: new Date('2026-03-17T00:00:00Z'),
    };
    idempotencyService.get.mockResolvedValue(cachedResult);

    const result = await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor({ inspectorId: 'inspector-1' }),
    });

    expect(result).toEqual(cachedResult);
    expect(serviceGroupRepo.findById).not.toHaveBeenCalled();
    expect(serviceGroupRepo.acceptOptimistic).not.toHaveBeenCalled();
    expect(idempotencyService.get).toHaveBeenCalledWith('accept-offer:group-1:inspector-1', 'accept-offer');
  });

  it('should throw ForbiddenError when a different inspector replays an idempotency key (identity mismatch)', async () => {
    const cachedResult = {
      groupId: 'group-1',
      status: 'ACCEPTED',
      assignedInspectorId: 'inspector-1',
      appointmentsScheduled: 5,
      acceptedAt: new Date('2026-03-17T00:00:00Z'),
    };
    idempotencyService.get.mockResolvedValue(cachedResult);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ inspectorId: 'inspector-other' }),
        idempotencyKey: 'accept-offer:group-1:inspector-1',
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ inspectorId: 'inspector-other' }),
        idempotencyKey: 'accept-offer:group-1:inspector-1',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'ACCEPT_OFFER_IDENTITY_MISMATCH' }));
  });

  it('should cache result after successful execution', async () => {
    idempotencyService.get.mockResolvedValue(null);
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());
    vi.mocked(serviceGroupRepo.acceptOptimistic).mockResolvedValue(1);
    vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);

    await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor(),
    });

    expect(idempotencyService.set).toHaveBeenCalledWith(
      'accept-offer:group-1:inspector-1',
      'accept-offer',
      expect.objectContaining({
        groupId: 'group-1',
        status: 'ACCEPTED',
        assignedInspectorId: 'inspector-1',
        appointmentsScheduled: 5,
      }),
      24,
    );
  });

  it('should accept offer successfully for eligible inspector on PUBLISHED group', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());
    vi.mocked(serviceGroupRepo.acceptOptimistic).mockResolvedValue(1);
    vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);

    const result = await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor(),
    });

    expect(result.groupId).toBe('group-1');
    expect(result.status).toBe('ACCEPTED');
    expect(result.assignedInspectorId).toBe('inspector-1');
    expect(result.appointmentsScheduled).toBe(5);
    expect(result.acceptedAt).toBeInstanceOf(Date);
  });

  it('should throw InspectorRegionIneligibleError and not lock the group when the inspector does not cover its region', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());
    vi.mocked(serviceGroupRepo.isGroupEligibleForInspector).mockResolvedValue(false);

    await expect(
      useCase.execute({ groupId: 'group-1', inspectorId: 'inspector-1', actor: makeActor() }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INSPECTOR_REGION_INELIGIBLE', statusCode: 422 }));

    expect(serviceGroupRepo.isGroupEligibleForInspector).toHaveBeenCalledWith(
      'group-1',
      'inspector-1',
      makeInspector().serviceTypesJson.map((s) => s.serviceTypeId),
      makeInspector().blockedClientsJson,
    );
    expect(serviceGroupRepo.acceptOptimistic).not.toHaveBeenCalled();
    expect(idempotencyService.set).not.toHaveBeenCalled();
  });

  it('should reject non-INSP actors', async () => {
    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'OP' }),
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw NotFoundError for missing inspector', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'nonexistent',
        actor: makeActor(),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('should throw ServiceGroupNotFoundError for missing group', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        groupId: 'nonexistent',
        inspectorId: 'inspector-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupNotFoundError);
  });

  it('should throw GroupAlreadyAcceptedError when group already ACCEPTED', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'ACCEPTED', assignedInspectorId: 'other-inspector' }),
    );

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(GroupAlreadyAcceptedError);
  });

  it('should throw ServiceGroupInvalidStatusError for DRAFT group', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'DRAFT', publishedAt: null }),
    );

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupInvalidStatusError);
  });

  it('should throw ServiceGroupInvalidStatusError for CANCELLED group', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(
      makeGroupWithAppointments({ status: 'CANCELLED' }),
    );

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceGroupInvalidStatusError);
  });

  it('should throw InspectorInactiveError for inactive inspector', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ status: 'INACTIVE' }),
    );

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorInactiveError);
  });

  it('should throw InspectorServiceTypeIneligibleError for wrong service type', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ serviceTypesJson: [{ serviceTypeId: 'svc-type-other', certified: false }] }),
    );
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorServiceTypeIneligibleError);
  });

  it('should throw InspectorIneligibleError for wrong tenant eligibility', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(
      makeInspector({ blockedClientsJson: ['tenant-1'] }),
    );
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(InspectorIneligibleError);
  });

  it('should throw GroupAlreadyAcceptedError when acceptOptimistic returns 0 (race condition)', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());
    vi.mocked(serviceGroupRepo.acceptOptimistic).mockResolvedValue(0);

    await expect(
      useCase.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor(),
      }),
    ).rejects.toThrow(GroupAlreadyAcceptedError);
  });

  it('should call scheduleAppointments and update confirmedCount on success', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());
    vi.mocked(serviceGroupRepo.acceptOptimistic).mockResolvedValue(1);
    vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);

    await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor(),
    });

    expect(serviceGroupRepo.scheduleAppointments).toHaveBeenCalledWith('group-1', 'inspector-1');
    expect(serviceGroupRepo.update).toHaveBeenCalledWith('group-1', {
      confirmedCount: 5,
    });
  });

  it('should log audit with correct action on success', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());
    vi.mocked(serviceGroupRepo.acceptOptimistic).mockResolvedValue(1);
    vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);

    await useCase.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.accepted',
        actorType: 'USER',
        actorId: 'user-insp',
        entityType: 'ServiceGroup',
        entityId: 'group-1',
        tenantId: 'tenant-1',
        before: { status: 'PUBLISHED' },
        after: expect.objectContaining({
          status: 'ACCEPTED',
          assignedInspectorId: 'inspector-1',
          appointmentsScheduled: 5,
        }),
      }),
    );
  });

  // ── Availability slots are informational — they MUST NOT block accept ────────
  it('should accept successfully even when slot repo finds no matching slot (slots are informational)', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
    vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());
    vi.mocked(serviceGroupRepo.acceptOptimistic).mockResolvedValue(1);
    vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);
    const slotRepo: IAvailabilitySlotRepository = {
      findById: vi.fn(),
      findByInspectorAndWindow: vi.fn(),
      findMatchingSlot: vi.fn().mockResolvedValue(null),
      decrementCapacity: vi.fn(),
      incrementCapacity: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findAllByInspector: vi.fn(),
      countByInspector: vi.fn(),
      findExpiringForInspector: vi.fn(),
    } as IAvailabilitySlotRepository;
    const authorizationService = new AuthorizationService(auditService);
    const ucWithSlot = new AcceptOfferUseCase(
      serviceGroupRepo, inspectorRepo, auditService, idempotencyService, authorizationService, undefined, slotRepo,
    );

    const result = await ucWithSlot.execute({
      groupId: 'group-1',
      inspectorId: 'inspector-1',
      actor: makeActor(),
    });

    expect(result.status).toBe('ACCEPTED');
    expect(slotRepo.decrementCapacity).not.toHaveBeenCalled();
  });

  describe('early access (F08-2)', () => {
    const PARAMS = {
      hours: 12,
      cutoffUtc: '2026-11-09T22:00:00.000',
      enabledAtUtc: '2026-11-01T00:00:00.000',
      protectedFrom: '2026-11-12',
      minScore: 85,
      latestSnapshotDate: '2026-11-10',
    };
    const IN_WINDOW = {
      publishedAt: new Date('2026-11-10T10:00:00.000Z'), // after cutoff + after enabledAt
      scheduledDate: '2026-11-13', // >= protectedFrom
      hasQualifiedEligible: true,
    };
    let policy: { resolve: ReturnType<typeof vi.fn> };
    let logger: { info: ReturnType<typeof vi.fn> };
    let ucEa: AcceptOfferUseCase;

    beforeEach(() => {
      policy = { resolve: vi.fn().mockResolvedValue(PARAMS) };
      logger = { info: vi.fn() };
      ucEa = new AcceptOfferUseCase(
        serviceGroupRepo,
        inspectorRepo,
        auditService,
        idempotencyService,
        new AuthorizationService(auditService),
        undefined,
        undefined,
        policy,
        logger,
      );
      vi.mocked(inspectorRepo.findById).mockResolvedValue(makeInspector());
      vi.mocked(serviceGroupRepo.findById).mockResolvedValue(makeGroupWithAppointments());
      vi.mocked(serviceGroupRepo.acceptOptimistic).mockResolvedValue(1);
      vi.mocked(serviceGroupRepo.scheduleAppointments).mockResolvedValue(5);
    });

    const run = () =>
      ucEa.execute({ groupId: 'group-1', inspectorId: 'inspector-1', actor: makeActor() });

    it('refuses a below-level inspector for an in-window group (403, acceptOptimistic not called, logged)', async () => {
      vi.mocked(serviceGroupRepo.findEarlyAccessStateForGroup).mockResolvedValue(IN_WINDOW);

      await expect(run()).rejects.toThrow(
        expect.objectContaining({
          code: 'OFFER_EARLY_ACCESS_ONLY',
          statusCode: 403,
          details: { opensAt: '2026-11-10T22:00:00.000Z' },
        }),
      );
      expect(serviceGroupRepo.acceptOptimistic).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: 'group-1', opensAt: '2026-11-10T22:00:00.000Z' }),
        'marketplace.early_access_denied',
      );
    });

    it('checks the window AFTER region eligibility and BEFORE acceptOptimistic', async () => {
      const order: string[] = [];
      vi.mocked(serviceGroupRepo.isGroupEligibleForInspector).mockImplementation(async () => {
        order.push('eligible');
        return true;
      });
      vi.mocked(serviceGroupRepo.findEarlyAccessStateForGroup).mockImplementation(async () => {
        order.push('earlyAccessState');
        return IN_WINDOW;
      });
      vi.mocked(serviceGroupRepo.acceptOptimistic).mockImplementation(async () => {
        order.push('accept');
        return 1;
      });

      await expect(run()).rejects.toThrow(
        expect.objectContaining({ code: 'OFFER_EARLY_ACCESS_ONLY' }),
      );
      expect(order).toEqual(['eligible', 'earlyAccessState']); // acceptOptimistic never reached
    });

    it('(L-F08-08) accepts when the group was published before enabledAt', async () => {
      vi.mocked(serviceGroupRepo.findEarlyAccessStateForGroup).mockResolvedValue({
        ...IN_WINDOW,
        publishedAt: new Date('2026-10-31T00:00:00.000Z'),
      });
      const result = await run();
      expect(result.status).toBe('ACCEPTED');
      expect(serviceGroupRepo.acceptOptimistic).toHaveBeenCalled();
    });

    it('(DV3) accepts when no qualified-eligible inspector exists for the group', async () => {
      vi.mocked(serviceGroupRepo.findEarlyAccessStateForGroup).mockResolvedValue({
        ...IN_WINDOW,
        hasQualifiedEligible: false,
      });
      expect((await run()).status).toBe('ACCEPTED');
    });

    it('(DV3) accepts a group scheduled for today/D+1 (never gated)', async () => {
      vi.mocked(serviceGroupRepo.findEarlyAccessStateForGroup).mockResolvedValue({
        ...IN_WINDOW,
        scheduledDate: '2026-11-11', // D+1, before protectedFrom 2026-11-12
      });
      expect((await run()).status).toBe('ACCEPTED');
    });

    it('accepts without a state read when the policy returns no window', async () => {
      policy.resolve.mockResolvedValue(null);
      expect((await run()).status).toBe('ACCEPTED');
      expect(serviceGroupRepo.findEarlyAccessStateForGroup).not.toHaveBeenCalled();
    });

    it('idempotency-cache hit short-circuits before the early-access check', async () => {
      idempotencyService.get.mockResolvedValue({
        groupId: 'group-1',
        status: 'ACCEPTED',
        assignedInspectorId: 'insp-1',
        appointmentsScheduled: 5,
        acceptedAt: new Date(),
      });
      await ucEa.execute({
        groupId: 'group-1',
        inspectorId: 'inspector-1',
        actor: makeActor({ inspectorId: 'insp-1' }),
      });
      expect(policy.resolve).not.toHaveBeenCalled();
      expect(serviceGroupRepo.findEarlyAccessStateForGroup).not.toHaveBeenCalled();
    });
  });

});
