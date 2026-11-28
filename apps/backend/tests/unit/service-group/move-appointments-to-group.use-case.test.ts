import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { MoveAppointmentsToGroupUseCase } from '../../../src/modules/service-group/application/use-cases/move-appointments-to-group.use-case';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import type { IServiceGroupRepository, ServiceGroupWithAppointments } from '../../../src/modules/service-group/domain/service-group.repository';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { ServiceGroupTimeSyncLogger } from '../../../src/modules/service-group/application/sync-appointment-time-slot-to-group';
import { DomainEventBus, SERVICE_GROUP_EVENTS } from '../../../src/shared/application/events/domain-event-bus';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../src/modules/service-region/domain/service-region.repository';
import type { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import type { ConfirmationCycleService } from '../../../src/modules/appointment/application/services/confirmation-cycle.service';
import type { CancelEmptyGroupService } from '../../../src/modules/service-group/application/services/cancel-empty-group.service';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';

function makeEligibleInspector(id = 'insp-1'): InspectorEntity {
  return {
    id,
    isActive: () => true,
    supportsServiceType: () => true,
    isEligibleForTenant: () => true,
  } as unknown as InspectorEntity;
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, ...overrides };
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
    scheduledDate: new Date('2026-08-10T00:00:00.000Z'),
    timeSlotStart: '09:30',
    timeSlotEnd: '10:30',
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
    serviceGroupId: 'source-group',
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
    contacts: [],
    restrictions: [],
    hasActivePortalToken: false,
  };
}

function makeTargetGroup(
  overrides: Partial<ConstructorParameters<typeof ServiceGroupEntity>[0]> = {},
): ServiceGroupWithAppointments {
  const group = new ServiceGroupEntity({
    id: 'group-target',
    serviceTypeId: 'svc-type-1',
    status: 'PUBLISHED',
    groupSize: 2,
    offeredCount: 0,
    confirmedCount: 0,
    // Future date so the target is always date-eligible unless a test overrides it.
    scheduledDate: new Date('2026-08-20T00:00:00.000Z'),
    timeWindow: '09:00-12:00',
    name: null,
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
  });
  return {
    group,
    tenantIds: ['tenant-1'],
    primaryTenantId: 'tenant-1',
    agencies: [{ id: 'tenant-1', name: 'Tenant 1' }],
    appointments: [makeAppointmentEntity({ id: 'existing-1' }), makeAppointmentEntity({ id: 'existing-2' })],
  };
}

const BEFORE_CUTOFF = () => new Date('2026-08-10T02:00:00.000Z'); // 12:00 Sydney (AEST)

describe('MoveAppointmentsToGroupUseCase', () => {
  let groupRepo: IServiceGroupRepository;
  let appointmentRepo: IAppointmentRepository;
  let inspectorRepo: IInspectorRepository;
  let serviceRegionRepo: IServiceRegionRepository;
  let auditService: AuditService;
  let logger: ServiceGroupTimeSyncLogger;
  let eventBus: DomainEventBus;
  let confirmationCycleService: ConfirmationCycleService;
  let cancelEmptyGroupService: CancelEmptyGroupService;
  let idempotencyService: IIdempotencyService;

  function makeUseCase(clock: () => Date = BEFORE_CUTOFF): MoveAppointmentsToGroupUseCase {
    return new MoveAppointmentsToGroupUseCase(
      groupRepo,
      appointmentRepo,
      auditService,
      new AuthorizationService(auditService),
      inspectorRepo,
      serviceRegionRepo,
      confirmationCycleService,
      cancelEmptyGroupService,
      idempotencyService,
      eventBus,
      logger,
      clock,
    );
  }

  beforeEach(() => {
    groupRepo = {
      findById: vi.fn().mockResolvedValue(makeTargetGroup()),
      findStatusById: vi.fn().mockResolvedValue('ACCEPTED'), // source group is live
      moveAppointmentBetweenGroups: vi.fn().mockResolvedValue('MOVED_AWAITING'),
    } as unknown as IServiceGroupRepository;
    appointmentRepo = {
      findById: vi.fn().mockResolvedValue(makeAppointmentWithRelations()),
      update: vi.fn(),
    } as unknown as IAppointmentRepository;
    inspectorRepo = {
      findById: vi.fn().mockResolvedValue(makeEligibleInspector()),
    } as unknown as IInspectorRepository;
    serviceRegionRepo = {
      findPropertyIdsInInspectorRegions: vi.fn().mockResolvedValue(['property-1']),
    } as unknown as IServiceRegionRepository;
    auditService = { log: vi.fn() } as unknown as AuditService;
    logger = { error: vi.fn() } as unknown as ServiceGroupTimeSyncLogger;
    eventBus = new DomainEventBus();
    confirmationCycleService = { confirm: vi.fn().mockResolvedValue({}) } as unknown as ConfirmationCycleService;
    cancelEmptyGroupService = { cancelIfDead: vi.fn().mockResolvedValue(false) } as unknown as CancelEmptyGroupService;
    idempotencyService = { get: vi.fn().mockResolvedValue(null), set: vi.fn() } as unknown as IIdempotencyService;
  });

  it('moves a SCHEDULED member of an ACCEPTED group into a PUBLISHED group (→ AWAITING_INSPECTOR)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'SCHEDULED', serviceGroupId: 'source-group' }),
    );

    const result = await makeUseCase().execute({ groupId: 'group-target', appointmentIds: ['appt-1'], actor: makeActor() });

    expect(result.movedCount).toBe(1);
    expect(result.results).toEqual([{ appointmentId: 'appt-1', status: 'OK' }]);
    expect(groupRepo.moveAppointmentBetweenGroups).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      fromGroupId: 'source-group',
      toGroupId: 'group-target',
      expectedTargetInspectorId: null,
    });
    expect(confirmationCycleService.confirm).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'appointment.moved_between_groups', entityId: 'appt-1' }));
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.status_transition',
      before: { status: 'SCHEDULED' },
      after: { status: 'AWAITING_INSPECTOR' },
    }));
    expect(cancelEmptyGroupService.cancelIfDead).toHaveBeenCalledWith('source-group');
  });

  it('moves into an ACCEPTED group (→ SCHEDULED under the committed inspector) and emits MEMBERS_ADDED', async () => {
    vi.mocked(groupRepo.findById).mockResolvedValue(
      makeTargetGroup({ status: 'ACCEPTED', assignedInspectorId: 'insp-1' }),
    );
    vi.mocked(groupRepo.moveAppointmentBetweenGroups).mockResolvedValue('MOVED_SCHEDULED');
    const emit = vi.spyOn(eventBus, 'emit');

    const result = await makeUseCase().execute({ groupId: 'group-target', appointmentIds: ['appt-1'], actor: makeActor() });

    expect(result.movedCount).toBe(1);
    expect(groupRepo.moveAppointmentBetweenGroups).toHaveBeenCalledWith(
      expect.objectContaining({ toGroupId: 'group-target', expectedTargetInspectorId: 'insp-1' }),
    );
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: SERVICE_GROUP_EVENTS.MEMBERS_ADDED,
      payload: expect.objectContaining({ groupId: 'group-target', inspectorId: 'insp-1', appointmentIds: ['appt-1'] }),
    }));
  });

  it('force-confirms the tenant BEFORE the move when the target is scheduled for today (Sydney)', async () => {
    vi.mocked(groupRepo.findById).mockResolvedValue(
      makeTargetGroup({ scheduledDate: new Date('2026-08-10T00:00:00.000Z') }), // today for BEFORE_CUTOFF
    );
    const order: string[] = [];
    vi.mocked(confirmationCycleService.confirm).mockImplementation(async () => { order.push('confirm'); return {} as never; });
    vi.mocked(groupRepo.moveAppointmentBetweenGroups).mockImplementation(async () => { order.push('move'); return 'MOVED_AWAITING'; });

    const result = await makeUseCase().execute({ groupId: 'group-target', appointmentIds: ['appt-1'], actor: makeActor() });

    expect(result.movedCount).toBe(1);
    expect(order).toEqual(['confirm', 'move']);
    expect(confirmationCycleService.confirm).toHaveBeenCalledWith('appt-1', 'tenant-1', 'OPERATOR_FORCED', null);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'appointment.force_manual_confirmation',
      metadata: expect.objectContaining({ trigger: 'group_move_current_day' }),
    }));
  });

  it('does not move the appointment if the pre-move force-confirm fails (no limbo)', async () => {
    vi.mocked(groupRepo.findById).mockResolvedValue(
      makeTargetGroup({ scheduledDate: new Date('2026-08-10T00:00:00.000Z') }),
    );
    vi.mocked(confirmationCycleService.confirm).mockRejectedValue(new Error('db down'));

    const result = await makeUseCase().execute({ groupId: 'group-target', appointmentIds: ['appt-1'], actor: makeActor() });

    expect(result.movedCount).toBe(0);
    expect(result.results[0]!.status).toBe('ERROR');
    expect(groupRepo.moveAppointmentBetweenGroups).not.toHaveBeenCalled();
  });

  it('rejects an ungrouped appointment with NOT_GROUPED', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ serviceGroupId: null }),
    );
    vi.mocked(groupRepo.findStatusById).mockResolvedValue(null);

    const result = await makeUseCase().execute({ groupId: 'group-target', appointmentIds: ['appt-1'], actor: makeActor() });

    expect(result.results[0]!.status).toBe('NOT_GROUPED');
    expect(groupRepo.moveAppointmentBetweenGroups).not.toHaveBeenCalled();
  });

  it('rejects a member already in the target group with ALREADY_IN_TARGET', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ serviceGroupId: 'group-target' }),
    );
    vi.mocked(groupRepo.findStatusById).mockResolvedValue('PUBLISHED');

    const result = await makeUseCase().execute({ groupId: 'group-target', appointmentIds: ['appt-1'], actor: makeActor() });

    expect(result.results[0]!.status).toBe('ALREADY_IN_TARGET');
  });

  it('rejects every item with TARGET_DATE_INELIGIBLE when the target is today after the 18:50 cutoff', async () => {
    vi.mocked(groupRepo.findById).mockResolvedValue(
      makeTargetGroup({ scheduledDate: new Date('2026-08-10T00:00:00.000Z') }), // today
    );
    const afterCutoff = () => new Date('2026-08-10T09:00:00.000Z'); // 19:00 Sydney

    const result = await makeUseCase(afterCutoff).execute({ groupId: 'group-target', appointmentIds: ['appt-1'], actor: makeActor() });

    expect(result.results[0]!.status).toBe('TARGET_DATE_INELIGIBLE');
    expect(groupRepo.moveAppointmentBetweenGroups).not.toHaveBeenCalled();
  });

  it('returns the cached result on an idempotent replay', async () => {
    const cached = { results: [{ appointmentId: 'appt-1', status: 'OK' as const }], movedCount: 1 };
    vi.mocked(idempotencyService.get).mockResolvedValue(cached);

    const result = await makeUseCase().execute({ groupId: 'group-target', appointmentIds: ['appt-1'], actor: makeActor(), idempotencyKey: 'k1' });

    expect(result).toBe(cached);
    expect(groupRepo.findById).not.toHaveBeenCalled();
  });

  it('forbids a CL_ADMIN actor', async () => {
    await expect(
      makeUseCase().execute({ groupId: 'group-target', appointmentIds: ['appt-1'], actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }) }),
    ).rejects.toThrow();
    expect(groupRepo.findById).not.toHaveBeenCalled();
  });
});
