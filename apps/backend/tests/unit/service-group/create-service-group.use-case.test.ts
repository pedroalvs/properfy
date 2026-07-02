import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/create-service-group.use-case';
import type { IServiceGroupRepository } from '../../../src/modules/service-group/domain/service-group.repository';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import { futureDateStr } from '../../helpers/date-fixtures';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../src/shared/domain/errors';
import { AppointmentNotFoundError } from '../../../src/modules/appointment/domain/appointment.errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import {
  AppointmentInvalidStatusError,
  PriorityDateTooCloseError,
  ServiceRegionInactiveError,
} from '../../../src/modules/service-group/domain/service-group.errors';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { ServiceRegionEntity } from '../../../src/modules/service-region/domain/service-region.entity';
import type { ServiceGroupTimeSyncLogger } from '../../../src/modules/service-group/application/sync-appointment-time-slot-to-group';

const REGION_ID = 'region-1';

function makeRegionEntity(overrides: Partial<{ id: string; status: string }> = {}): ServiceRegionEntity {
  return new ServiceRegionEntity({
    id: overrides.id ?? REGION_ID,
    tenantId: 'tenant-1',
    name: 'Sydney CBD',
    geojson: { type: 'Polygon', coordinates: [] },
    color: '#3b82f6',
    status: overrides.status ?? 'ACTIVE',
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeAppointmentEntity(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    inspectorId: null,
    status: 'AWAITING_INSPECTOR',
    scheduledDate: new Date('2026-04-01'),
    timeSlotStart: '09:00', timeSlotEnd: '10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 150,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeAppointmentWithRelations(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentWithRelations {
  return {
    appointment: makeAppointmentEntity(overrides),
    contact: null,
    restrictions: [],
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

function makeAppointmentIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `appt-${i + 1}`);
}

function createMockRegionRepo(regionEntity?: ServiceRegionEntity | null): IServiceRegionRepository {
  const entity = regionEntity === undefined ? makeRegionEntity() : regionEntity;
  return {
    findById: vi.fn().mockResolvedValue(entity),
    findByName: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    findPropertyIdsInInspectorRegions: vi.fn(),
    resolveRegionsForAppointments: vi.fn().mockResolvedValue([]),
    findContainingPoint: vi.fn(),
    countPublishedGroupsByRegionId: vi.fn().mockResolvedValue(0),
    countActiveInspectorsInRegion: vi.fn().mockResolvedValue(0),
    setInspectorRegions: vi.fn(),
    getInspectorRegionIds: vi.fn(),
    getInspectorRegionIdsBatch: vi.fn(),
    delete: vi.fn(),
  };
}

// Future date far enough for PRIORITY_24H. Use a relative helper — a hardcoded
// literal drifts into the past and breaks the schedule guard (see date-fixtures).
const farFutureDate = futureDateStr(60);

describe('CreateServiceGroupUseCase', () => {
  let serviceGroupRepo: IServiceGroupRepository;
  let appointmentRepo: IAppointmentRepository;
  let serviceRegionRepo: IServiceRegionRepository;
  let auditService: AuditService;
  let logger: ServiceGroupTimeSyncLogger;
  let useCase: CreateServiceGroupUseCase;

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
    appointmentRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
    };
    serviceRegionRepo = createMockRegionRepo();
    auditService = { log: vi.fn() } as unknown as AuditService;
    logger = { error: vi.fn() } as unknown as ServiceGroupTimeSyncLogger;

    const authorizationService = new AuthorizationService(auditService);
    useCase = new CreateServiceGroupUseCase(
      serviceGroupRepo,
      appointmentRepo,
      auditService,
      authorizationService,
      serviceRegionRepo,
      undefined,
      undefined,
      logger,
    );
  });

  it('should return the DB-assigned sequential group code after save', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }
    // Simulate the DB sequence assigning group_number on persist.
    vi.mocked(serviceGroupRepo.save).mockImplementation(async (g) => {
      g.groupNumber = 42;
    });

    const result = await useCase.execute({
      appointmentIds,
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      serviceRegionId: REGION_ID,
      actor: makeActor(),
    });

    expect(result.groupNumber).toBe(42);
    expect(result.code).toBe('42');
  });

  it('should create a service group with 5 valid appointments (happy path)', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    const result = await useCase.execute({
      appointmentIds,
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      serviceRegionId: REGION_ID,
      actor: makeActor(),
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe('DRAFT');
    expect(result.groupSize).toBe(5);
    expect(result.tenantId).toBe('tenant-1');
    expect(result.serviceTypeId).toBe('svc-type-1');
    expect(result.priorityMode).toBe('STANDARD');
    expect(result.priorityExpiresAt).toBeNull();
    expect(result.serviceRegionId).toBe(REGION_ID);
    // Cross-tenant: the region is looked up by id only (tenant arg null), so a
    // region owned by another agency can be attached.
    expect(serviceRegionRepo.findById).toHaveBeenCalledWith(REGION_ID, null);
    expect(serviceGroupRepo.save).toHaveBeenCalledOnce();
    expect(serviceGroupRepo.linkAppointments).toHaveBeenCalledWith(
      appointmentIds,
      expect.any(String),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'service_group.created' }),
    );
  });

  it('syncs an appointment outside the group time window to the full group window', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-1', timeSlotStart: '08:00', timeSlotEnd: '10:00' }),
    );

    await useCase.execute({
      appointmentIds: ['appt-1'],
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      serviceRegionId: REGION_ID,
      actor: makeActor(),
    });

    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      timeSlotStart: '09:00',
      timeSlotEnd: '12:00',
    });
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.updated',
      entityId: 'appt-1',
      before: { timeSlotStart: '08:00', timeSlotEnd: '10:00' },
      after: { timeSlotStart: '09:00', timeSlotEnd: '12:00' },
      reason: 'Added to service group',
      metadata: expect.objectContaining({ automaticTimeSlotSync: true, groupId: expect.any(String) }),
    }));
  });

  it('does not update appointment time when it is fully inside the group time window', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-1', timeSlotStart: '09:30', timeSlotEnd: '10:30' }),
    );

    await useCase.execute({
      appointmentIds: ['appt-1'],
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      serviceRegionId: REGION_ID,
      actor: makeActor(),
    });

    expect(appointmentRepo.update).not.toHaveBeenCalledWith('appt-1', 'tenant-1', expect.objectContaining({
      timeSlotStart: expect.any(String),
      timeSlotEnd: expect.any(String),
    }));
    expect(auditService.log).not.toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.updated',
      entityId: 'appt-1',
    }));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not fail group creation when an appointment has malformed legacy time values', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-1', timeSlotStart: '010:00', timeSlotEnd: '10:00' }),
    );

    const result = await useCase.execute({
      appointmentIds: ['appt-1'],
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      serviceRegionId: REGION_ID,
      actor: makeActor(),
    });

    expect(result.id).toBeDefined();
    expect(serviceGroupRepo.save).toHaveBeenCalledOnce();
    expect(serviceGroupRepo.linkAppointments).toHaveBeenCalledWith(['appt-1'], expect.any(String));
    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.updated',
      entityId: 'appt-1',
    }));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not fail group creation when the post-link time sync update fails', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-1', timeSlotStart: '08:00', timeSlotEnd: '10:00' }),
    );
    vi.mocked(appointmentRepo.update).mockRejectedValueOnce(new Error('sync failed'));

    const result = await useCase.execute({
      appointmentIds: ['appt-1'],
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      serviceRegionId: REGION_ID,
      actor: makeActor(),
    });

    expect(result.id).toBeDefined();
    expect(serviceGroupRepo.save).toHaveBeenCalledOnce();
    expect(serviceGroupRepo.linkAppointments).toHaveBeenCalledWith(['appt-1'], expect.any(String));
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      timeSlotStart: '09:00',
      timeSlotEnd: '12:00',
    });
    expect(auditService.log).not.toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.updated',
      entityId: 'appt-1',
    }));
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        appointmentId: 'appt-1',
        tenantId: 'tenant-1',
        groupId: expect.any(String),
      }),
      'appointment time-slot sync to group failed',
    );
  });

  it('should throw NotFoundError when service region does not exist', async () => {
    serviceRegionRepo = createMockRegionRepo(null);
    const authorizationService = new AuthorizationService(auditService);
    useCase = new CreateServiceGroupUseCase(
      serviceGroupRepo, appointmentRepo, auditService, authorizationService, serviceRegionRepo,
    );

    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    await expect(
      useCase.execute({
        appointmentIds,
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        serviceRegionId: 'nonexistent-region-id',
        actor: makeActor(),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('should throw ServiceRegionInactiveError when region is INACTIVE', async () => {
    serviceRegionRepo = createMockRegionRepo(makeRegionEntity({ status: 'INACTIVE' }));
    const authorizationService = new AuthorizationService(auditService);
    useCase = new CreateServiceGroupUseCase(
      serviceGroupRepo, appointmentRepo, auditService, authorizationService, serviceRegionRepo,
    );

    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    await expect(
      useCase.execute({
        appointmentIds,
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        serviceRegionId: REGION_ID,
        actor: makeActor(),
      }),
    ).rejects.toThrow(ServiceRegionInactiveError);
  });

  it('should reject non-AM/OP actors', async () => {
    await expect(
      useCase.execute({
        appointmentIds: makeAppointmentIds(5),
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        serviceRegionId: REGION_ID,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP role', async () => {
    await expect(
      useCase.execute({
        appointmentIds: makeAppointmentIds(5),
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        serviceRegionId: REGION_ID,
        actor: makeActor({ role: 'INSP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw AppointmentNotFoundError when an appointment is missing', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-1' }),
    );
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(null);

    await expect(
      useCase.execute({
        appointmentIds: ['appt-1', 'appt-missing', 'appt-3', 'appt-4', 'appt-5'],
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        serviceRegionId: REGION_ID,
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  it('should throw when appointment is in invalid status (e.g. SCHEDULED)', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 4; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-5', status: 'SCHEDULED' }),
    );

    await expect(
      useCase.execute({
        appointmentIds,
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        serviceRegionId: REGION_ID,
        actor: makeActor(),
      }),
    ).rejects.toThrow(AppointmentInvalidStatusError);
  });

  it('should allow mixed-agency (cross-tenant) groups without a region', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 4; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}`, tenantId: 'tenant-1' }),
      );
    }
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-5', tenantId: 'tenant-2' }),
    );

    const result = await useCase.execute({
      appointmentIds,
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      actor: makeActor(),
    });

    // Mixed agency → no single tenant on the group.
    expect(result.tenantId).toBeNull();
    expect(serviceGroupRepo.save).toHaveBeenCalled();
  });

  it('should reject assigning a region to a mixed-agency group', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 4; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}`, tenantId: 'tenant-1' }),
      );
    }
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-5', tenantId: 'tenant-2' }),
    );

    await expect(
      useCase.execute({
        appointmentIds,
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        serviceRegionId: REGION_ID,
        actor: makeActor(),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should allow fewer than 5 appointments (no minimum beyond 1)', async () => {
    const appointmentIds = makeAppointmentIds(3);
    for (let i = 0; i < 3; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    const result = await useCase.execute({
      appointmentIds,
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      serviceRegionId: REGION_ID,
      actor: makeActor(),
    });

    expect(result.id).toBeDefined();
    expect(result.groupSize).toBe(3);
  });

  it('should allow more than 30 appointments (no upper bound)', async () => {
    const appointmentIds = makeAppointmentIds(31);
    for (let i = 0; i < 31; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    const result = await useCase.execute({
      appointmentIds,
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      serviceRegionId: REGION_ID,
      actor: makeActor(),
    });

    expect(result.id).toBeDefined();
    expect(result.groupSize).toBe(31);
  });

  it('should throw PriorityDateTooCloseError for PRIORITY_24H with close date', async () => {
    // Pin time to 06:00 UTC so +12h lands on the same day at 18:00 UTC.
    // The time window 09:00-12:00 has not yet started at 06:00, so validateNewSchedule
    // passes and the PRIORITY_24H check fires as expected.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T06:00:00.000Z'));

    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    const tooCloseDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 2026-07-15T18:00Z → dateStr = '2026-07-15'
    const dateStr = tooCloseDate.toISOString().split('T')[0];

    await expect(
      useCase.execute({
        appointmentIds,
        serviceTypeId: 'svc-type-1',
        scheduledDate: dateStr,
        timeWindow: '09:00-12:00',
        priorityMode: 'PRIORITY_24H',
        serviceRegionId: REGION_ID,
        actor: makeActor(),
      }),
    ).rejects.toThrow(PriorityDateTooCloseError);

    vi.useRealTimers();
  });

  it('should set priorityExpiresAt for PRIORITY_24H with valid date', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    const result = await useCase.execute({
      appointmentIds,
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'PRIORITY_24H',
      serviceRegionId: REGION_ID,
      actor: makeActor(),
    });

    expect(result.priorityExpiresAt).not.toBeNull();
    expect(result.priorityMode).toBe('PRIORITY_24H');
    const expectedExpiry = new Date(new Date(farFutureDate).getTime() - 24 * 60 * 60 * 1000);
    expect(result.priorityExpiresAt!.getTime()).toBe(expectedExpiry.getTime());
  });

  it('should allow OP role to create group', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    const result = await useCase.execute({
      appointmentIds,
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      serviceRegionId: REGION_ID,
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe('DRAFT');
  });

  it('looks up appointments cross-tenant so a cross-agency group is not scoped to the actor tenant', async () => {
    // Groups are tenant-agnostic and only AM/OP (cross-tenant) reach here. Even if an
    // OP token carried a stray tenantId, appointment lookup must stay cross-tenant —
    // otherwise other agencies' appointments would silently 404 during create.
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-1', tenantId: 'tenant-2' }),
    );

    await useCase.execute({
      appointmentIds: ['appt-1'],
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
  });

  it('should allow a single-appointment group', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
      makeAppointmentWithRelations({ id: 'appt-1' }),
    );

    const result = await useCase.execute({
      appointmentIds: ['appt-1'],
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      serviceRegionId: REGION_ID,
      actor: makeActor(),
    });

    expect(result.id).toBeDefined();
    expect(result.groupSize).toBe(1);
  });

  describe('GAP-011: configurable priority offer hours', () => {
    let tenantRepo: ITenantRepository;

    function makeTenantEntity(settingsJson: Record<string, unknown> = {}): TenantEntity {
      return new TenantEntity({
        id: 'tenant-1',
        name: 'Test Tenant',
        legalName: 'Test Tenant Pty Ltd',
        status: 'ACTIVE',
        timezone: 'Australia/Sydney',
        currency: 'AUD',
        settingsJson,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    }

    beforeEach(() => {
      tenantRepo = {
        findById: vi.fn().mockResolvedValue(makeTenantEntity({ priorityOfferHours: 24 })),
        findByLegalName: vi.fn(),
        findAll: vi.fn(),
        count: vi.fn(),
        save: vi.fn(),
        update: vi.fn(),
      };
    });

    it('should use tenant priorityOfferHours=48 for priority expiry calculation', async () => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(
        makeTenantEntity({ priorityOfferHours: 48 }),
      );

      const useCaseWithTenant = new CreateServiceGroupUseCase(
        serviceGroupRepo, appointmentRepo, auditService, new AuthorizationService(auditService), serviceRegionRepo, tenantRepo,
      );

      const appointmentIds = makeAppointmentIds(5);
      for (let i = 0; i < 5; i++) {
        vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
          makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
        );
      }

      // Relative future date (not a hardcoded calendar date) so the test never drifts
      // within priorityOfferHours of the real clock and trips PRIORITY_DATE_TOO_CLOSE.
      const scheduledDate = farFutureDate;
      const result = await useCaseWithTenant.execute({
        appointmentIds,
        serviceTypeId: 'svc-type-1',
        scheduledDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'PRIORITY_24H',
        serviceRegionId: REGION_ID,
        actor: makeActor(),
      });

      expect(result.priorityExpiresAt).not.toBeNull();
      const expectedExpiry = new Date(new Date(scheduledDate).getTime() - 48 * 60 * 60 * 1000);
      expect(result.priorityExpiresAt!.getTime()).toBe(expectedExpiry.getTime());
    });

    it('should fall back to 24h when tenant has no priorityOfferHours setting', async () => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(
        makeTenantEntity({}),
      );

      const useCaseWithTenant = new CreateServiceGroupUseCase(
        serviceGroupRepo, appointmentRepo, auditService, new AuthorizationService(auditService), serviceRegionRepo, tenantRepo,
      );

      const appointmentIds = makeAppointmentIds(5);
      for (let i = 0; i < 5; i++) {
        vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
          makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
        );
      }

      const result = await useCaseWithTenant.execute({
        appointmentIds,
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'PRIORITY_24H',
        serviceRegionId: REGION_ID,
        actor: makeActor(),
      });

      expect(result.priorityExpiresAt).not.toBeNull();
      const expectedExpiry = new Date(new Date(farFutureDate).getTime() - 24 * 60 * 60 * 1000);
      expect(result.priorityExpiresAt!.getTime()).toBe(expectedExpiry.getTime());
    });

    it('should fall back to 24h when no tenant repo is provided', async () => {
      const appointmentIds = makeAppointmentIds(5);
      for (let i = 0; i < 5; i++) {
        vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
          makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
        );
      }

      const result = await useCase.execute({
        appointmentIds,
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'PRIORITY_24H',
        serviceRegionId: REGION_ID,
        actor: makeActor(),
      });

      expect(result.priorityExpiresAt).not.toBeNull();
      const expectedExpiry = new Date(new Date(farFutureDate).getTime() - 24 * 60 * 60 * 1000);
      expect(result.priorityExpiresAt!.getTime()).toBe(expectedExpiry.getTime());
    });

    it('should ignore priorityOfferHours for STANDARD mode', async () => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(
        makeTenantEntity({ priorityOfferHours: 48 }),
      );

      const useCaseWithTenant = new CreateServiceGroupUseCase(
        serviceGroupRepo, appointmentRepo, auditService, new AuthorizationService(auditService), serviceRegionRepo, tenantRepo,
      );

      const appointmentIds = makeAppointmentIds(5);
      for (let i = 0; i < 5; i++) {
        vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
          makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
        );
      }

      const result = await useCaseWithTenant.execute({
        appointmentIds,
        serviceTypeId: 'svc-type-1',
        scheduledDate: farFutureDate,
        timeWindow: '09:00-12:00',
        priorityMode: 'STANDARD',
        serviceRegionId: REGION_ID,
        actor: makeActor(),
      });

      expect(result.priorityExpiresAt).toBeNull();
      expect(tenantRepo.findById).not.toHaveBeenCalled();
    });

    it('should reject PRIORITY_24H when scheduled date is less than configured hours away', async () => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(
        makeTenantEntity({ priorityOfferHours: 48 }),
      );

      const useCaseWithTenant = new CreateServiceGroupUseCase(
        serviceGroupRepo, appointmentRepo, auditService, new AuthorizationService(auditService), serviceRegionRepo, tenantRepo,
      );

      const appointmentIds = makeAppointmentIds(5);
      for (let i = 0; i < 5; i++) {
        vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
          makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
        );
      }

      // 30h from now — enough for 24h but not for 48h
      const tooCloseDate = new Date(Date.now() + 30 * 60 * 60 * 1000);
      const dateStr = tooCloseDate.toISOString().split('T')[0];

      await expect(
        useCaseWithTenant.execute({
          appointmentIds,
          serviceTypeId: 'svc-type-1',
          scheduledDate: dateStr,
          timeWindow: '09:00-12:00',
          priorityMode: 'PRIORITY_24H',
          serviceRegionId: REGION_ID,
          actor: makeActor(),
        }),
      ).rejects.toThrow(PriorityDateTooCloseError);
    });
  });

  it('should call audit log on success', async () => {
    const appointmentIds = makeAppointmentIds(5);
    for (let i = 0; i < 5; i++) {
      vi.mocked(appointmentRepo.findById).mockResolvedValueOnce(
        makeAppointmentWithRelations({ id: `appt-${i + 1}` }),
      );
    }

    await useCase.execute({
      appointmentIds,
      serviceTypeId: 'svc-type-1',
      scheduledDate: farFutureDate,
      timeWindow: '09:00-12:00',
      priorityMode: 'STANDARD',
      serviceRegionId: REGION_ID,
      actor: makeActor({ userId: 'actor-am' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_group.created',
        actorType: 'USER',
        actorId: 'actor-am',
        entityType: 'ServiceGroup',
        tenantId: 'tenant-1',
        after: expect.objectContaining({
          status: 'DRAFT',
          groupSize: 5,
          serviceTypeId: 'svc-type-1',
        }),
      }),
    );
  });
});
